const TRIAL_MS = 7 * 86400000;
const categories = new Set(['primary', 'jss', 'sss', 'teacher', 'university']);

function inWindow(start, end, now) {
  return (start ? Date.parse(start) : -Infinity) <= now && now < Date.parse(end);
}

function isRegistrationTrial(profile) {
  if (profile.free_access_source === 'trial') return true;
  if (profile.free_access_source) return false;
  // Older registration code recorded the trial dates just before inserting the profile.
  const created = Date.parse(profile.created_at);
  const start = Date.parse(profile.free_access_start);
  const end = Date.parse(profile.free_access_end);
  return Math.abs(start - created) <= 300000 && Math.abs(end - start - TRIAL_MS) <= 1000;
}

function profileAccess(profile, settings = {}, now = Date.now()) {
  if (!profile) return { allowed: false, reason: 'registration_required', status: 'SIGNED OUT' };
  if ((profile.account_status || 'active') !== 'active') {
    return { allowed: false, reason: 'blocked', status: 'BLOCKED' };
  }
  if (profile.paid_active && inWindow(profile.paid_access_start, profile.paid_access_end, now)) {
    return { allowed: true, reason: 'paid', status: 'PAID ACTIVE', paid_until: profile.paid_access_end };
  }

  const trial = isRegistrationTrial(profile);
  const individual = profile.free_access_source === 'individual';
  const trialEnd = Date.parse(profile.created_at) + TRIAL_MS;
  const freeEnd = trial ? Math.min(Date.parse(profile.free_access_end), trialEnd) : Date.parse(profile.free_access_end);
  const freeStart = profile.free_access_start;
  if ((trial || individual) && freeEnd > now && (!freeStart || Date.parse(freeStart) <= now)) {
    return { allowed: true, reason: trial ? 'registration_trial' : 'admin_free_access', status: trial ? 'FREE TRIAL' : 'FREE ACCESS', free_until: new Date(freeEnd).toISOString() };
  }

  const categoryFree = categories.has(profile.category) && settings[profile.category + '_free'] === true;
  if (profile.free_access_source !== 'ended' && !individual &&
      (settings.free_access_enabled === true || categoryFree) &&
      (!settings.free_access_start || Date.parse(settings.free_access_start) <= now) &&
      (!settings.free_access_until || now < Date.parse(settings.free_access_until))) {
    return { allowed: true, reason: 'general_free_access', status: 'FREE ACCESS', free_until: settings.free_access_until || null };
  }

  const paidStart = Date.parse(profile.paid_access_start);
  const individualStart = Date.parse(freeStart);
  const nextPaid = profile.paid_active && paidStart > now && paidStart < Date.parse(profile.paid_access_end) ? paidStart : Infinity;
  const nextFree = individual && individualStart > now && individualStart < freeEnd ? individualStart : Infinity;
  const nextStart = Math.min(nextPaid, nextFree);
  if (Number.isFinite(nextStart)) {
    return { allowed: false, reason: 'access_scheduled', status: 'ACCESS SCHEDULED', starts_at: new Date(nextStart).toISOString() };
  }
  return { allowed: false, reason: 'payment_required', status: 'PAYMENT REQUIRED' };
}

module.exports = { profileAccess };
