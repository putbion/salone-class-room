import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const buckets = new Map();

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  }
});

const isAllowedOrigin = req => {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.host.toLowerCase();
    if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return true;
    if (host === 'www.saloneclassroom.com' || host === 'saloneclassroom.com') return true;
    if (host.endsWith('.netlify.app')) return true;
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

const checkRate = (key, limit, windowMs) => {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;

  if (buckets.size > 2000) {
    for (const [k, v] of buckets) {
      if (now >= v.reset) buckets.delete(k);
    }
  }

  return b.count <= limit;
};

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!isAllowedOrigin(req)) return json(403, { error: 'Cross-origin request rejected.' });

  const rawIp = req.headers.get('x-nf-client-connection-ip') || req.headers.get('client-ip') || 'unknown';
  const ip = rawIp.split(',')[0].trim().slice(0, 80);

  if (!checkRate('ip:' + ip, 10, 60000)) {
    return json(429, { error: 'Too many visual requests. Please wait a moment.' });
  }

  const raw = await req.text();
  if (raw.length > 12000) return json(413, { error: 'Request is too large.' });

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Invalid request.' });
  }

  const level = String(body.level || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30),
    subject = String(body.subject || '').replace(/[<>]/g, '').slice(0, 180),
    topic = String(body.topic || '').replace(/[<>]/g, '').slice(0, 1200),
    token = String(body.token || '');

  if (!topic) return json(400, { error: 'A diagram topic is required.' });

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return json(503, { error: 'Service configuration incomplete.' });

  try {
    const [ticket, signature] = token.split('.');
    if (!ticket || !signature) throw new Error('missing token parts');

    const expected = createHmac('sha256', secret).update(ticket).digest('base64url');
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new Error('signature');
    }

    const claim = JSON.parse(Buffer.from(ticket, 'base64url').toString('utf8'));
    if (claim.exp < Date.now() || claim.topic_hash !== createHash('sha256').update(body.topic || '').digest('hex')) {
      throw new Error('claim');
    }

    // Protect against ticket replay flood: allow maximum 3 attempts per ticket
    if (!checkRate('ticket:' + ticket, 3, 5 * 60 * 1000)) {
      return json(429, { error: 'Visual ticket already used. Please request a new explanation.' });
    }
  } catch {
    return json(403, { error: 'Diagram request is not authorized.' });
  }

  const key = process.env.NETLIFY_AI_GATEWAY_KEY,
    base = String(process.env.NETLIFY_AI_GATEWAY_BASE_URL || '').replace(/\/$/, '');

  if (!key || !base) return json(503, { error: 'Diagram generation is not configured.' });

  const prompt = `Create one clear, accurate educational visual for a ${level || 'student'} learner studying ${subject || 'this topic'}: ${topic}. Use a clean textbook style, readable labels, a plain light background, and age-appropriate detail. If this asks for a map, show the requested geographic area accurately and label only relevant features. Do not add decorative or unrelated elements.`;

  try {
    const response = await fetch(`${base}/v1beta/models/gemini-3.1-flash-image:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } })
    });
    const data = await response.json();
    if (!response.ok) throw new Error('Image service ' + response.status);

    const part = data.candidates?.[0]?.content?.parts?.find(item => item.inlineData?.data);
    if (!part) return json(502, { error: 'No diagram was returned.' });

    const mime = String(part.inlineData.mimeType || 'image/png');
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(mime)) {
      return json(502, { error: 'Invalid image format returned.' });
    }

    return json(200, {
      image: `data:${mime};base64,${part.inlineData.data}`,
      alt: `Educational visual for ${topic.slice(0, 180)}`
    });
  } catch (error) {
    console.error('[diagram]', error.message);
    return json(502, { error: 'The diagram could not be generated right now.' });
  }
};
