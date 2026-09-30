const crypto = require('crypto');

const buckets = new Map();

const baseHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { ...baseHeaders, ...extra },
  body: JSON.stringify(body)
});

const getHeader = (event, name) => {
  if (!event || !event.headers) return '';
  const target = String(name || '').toLowerCase();
  for (const [k, v] of Object.entries(event.headers)) {
    if (k.toLowerCase() === target) return String(v || '').trim();
  }
  return '';
};

const clientIp = event => {
  const raw = getHeader(event, 'x-nf-client-connection-ip') ||
    getHeader(event, 'client-ip') ||
    getHeader(event, 'x-forwarded-for') ||
    'unknown';
  return raw.split(',')[0].trim().replace(/[^a-fA-F0-9.:_-]/g, '').slice(0, 80) || 'unknown';
};

const fingerprint = event => {
  const secret = process.env.VISITOR_FINGERPRINT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'salone-class-room';
  const ua = getHeader(event, 'user-agent').slice(0, 300);
  return crypto.createHmac('sha256', secret).update(clientIp(event) + '|' + ua).digest('hex').slice(0, 40);
};

const rateLimit = (event, { name = 'default', limit = 30, windowMs = 60000, key } = {}) => {
  const now = Date.now(), k = name + '|' + (key || clientIp(event));
  let b = buckets.get(k);
  if (!b || now >= b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(k, b);
  }
  b.count++;

  if (buckets.size > 5000) {
    for (const [x, v] of buckets) {
      if (now >= v.reset) buckets.delete(x);
    }
    if (buckets.size > 5000) {
      const excess = buckets.size - 4000;
      let count = 0;
      for (const k of buckets.keys()) {
        buckets.delete(k);
        if (++count >= excess) break;
      }
    }
  }

  return {
    allowed: b.count <= limit,
    retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)),
    remaining: Math.max(0, limit - b.count)
  };
};

const enforceRate = (event, opts) => {
  const r = rateLimit(event, opts);
  return r.allowed ? null : json(429, { error: 'Too many requests. Please wait and try again.' }, { 'Retry-After': String(r.retryAfter) });
};

const bodyTooLarge = (event, maxBytes = 32768) => Buffer.byteLength(event.body || '', 'utf8') > maxBytes;

/**
 * Validates request Origin / Referer for CSRF prevention on state-changing requests.
 */
const verifyOrigin = event => {
  const origin = getHeader(event, 'origin');
  if (!origin) return true; // Direct non-browser or non-cross-origin calls

  try {
    const parsed = new URL(origin);
    const host = parsed.host.toLowerCase();

    // Allow localhost and local IP in development
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return true;

    // Allow primary domains and netlify deploy previews
    if (host === 'www.saloneclassroom.com' || host === 'saloneclassroom.com') return true;
    if (host.endsWith('.netlify.app')) return true;

    // Allow configured deployment URL
    if (process.env.URL) {
      try {
        const envUrl = new URL(process.env.URL);
        if (host === envUrl.host.toLowerCase()) return true;
      } catch {}
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Checks honeypot field names to detect and reject bot submissions without affecting legitimate users.
 */
const isBotSubmission = (body = {}, fieldNames = ['website', 'hp_check', 'address_confirm', 'bot_field']) => {
  if (!body || typeof body !== 'object') return false;
  for (const field of fieldNames) {
    if (body[field] && String(body[field]).trim().length > 0) {
      return true;
    }
  }
  return false;
};

/**
 * Validates an administrator Bearer / token directly against Supabase Auth & admin_users.
 * Avoids any server-side loopback HTTP fetches or dependency on event.headers.host (SSRF immune).
 */
const validateAdminSession = async ({ token, supabaseUrl, serviceRoleKey, adminEmail }) => {
  if (!token || typeof token !== 'string') return { allowed: false, email: null, role: null };
  const rawToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
  if (!rawToken || !supabaseUrl || !serviceRoleKey) return { allowed: false, email: null, role: null };

  const U = String(supabaseUrl).replace(/\/+$/, '');
  const K = serviceRoleKey;
  const ownerEmail = String(adminEmail || process.env.ADMIN_EMAIL || '').toLowerCase().trim();

  try {
    const vr = await fetch(U + '/auth/v1/user', {
      headers: { apikey: K, Authorization: 'Bearer ' + rawToken }
    });
    if (!vr.ok) return { allowed: false, email: null, role: null };

    const au = await vr.json();
    const email = String(au.email || '').toLowerCase().trim();
    if (!email) return { allowed: false, email: null, role: null };

    if (ownerEmail && email === ownerEmail) {
      return { allowed: true, email, role: 'owner' };
    }

    const r = await fetch(U + '/rest/v1/admin_users?email=eq.' + encodeURIComponent(email) + '&active=eq.true&select=email,role,active&limit=1', {
      headers: { apikey: K, Authorization: 'Bearer ' + K }
    });
    if (!r.ok) return { allowed: false, email, role: null };

    const rows = await r.json();
    if (rows[0] && rows[0].active) {
      return { allowed: true, email, role: rows[0].role || 'assistant' };
    }

    return { allowed: false, email, role: null };
  } catch (err) {
    console.error('[_security][validateAdminSession] Verification error:', err.message);
    return { allowed: false, email: null, role: null };
  }
};

/**
 * Asynchronously logs security events into app_events for audit trail.
 */
const logSecurityEvent = (supabaseUrl, serviceRoleKey, eventType, section, detail) => {
  if (!supabaseUrl || !serviceRoleKey || !eventType) return;
  const U = String(supabaseUrl).replace(/\/+$/, '');
  const K = serviceRoleKey;

  fetch(U + '/rest/v1/app_events', {
    method: 'POST',
    headers: {
      apikey: K,
      Authorization: 'Bearer ' + K,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      event_type: String(eventType).slice(0, 50),
      section: String(section || 'security').slice(0, 80),
      detail: String(detail || '').slice(0, 500)
    })
  }).catch(() => {});
};

/**
 * Sanitizes AI outputs before returning them to prevent dangerous HTML / script injection.
 */
const sanitizeAIOutput = s => String(s || '')
  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
  .replace(/javascript:/gi, 'blocked:')
  .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
  .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');

module.exports = {
  json,
  baseHeaders,
  getHeader,
  clientIp,
  fingerprint,
  rateLimit,
  enforceRate,
  bodyTooLarge,
  verifyOrigin,
  isBotSubmission,
  validateAdminSession,
  logSecurityEvent,
  sanitizeAIOutput
};
