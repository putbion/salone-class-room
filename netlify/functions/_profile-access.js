function inWindow(start, end, now) {
  const startsAt = start ? Date.parse(start) : -Infinity;
  const endsAt = end ? Date.parse(end) : NaN;
  return startsAt <= now && now < endsAt;
}

function profileAccess(profile, now = Date.now()) {
  if (!profile) return { allowed: false, reason: 'registration_required', status: 'SIGNED OUT' };
  if ((profile.account_status || 'active') !== 'active') {
    return { allowed: false, reason: 'blocked', status: 'BLOCKED' };
  }
  if (profile.paid_active && inWindow(profile.paid_access_start, profile.paid_access_end, now)) {
    return { allowed: true, reason: 'paid', status: 'PAID ACTIVE', paid_until: profile.paid_access_end };
  }
  if (inWindow(profile.free_access_start, profile.free_access_end, now)) {
    return { allowed: true, reason: 'admin_free_access', status: 'FREE ACCESS', free_until: profile.free_access_end };
  }
  const starts = [
    profile.paid_active ? profile.paid_access_start : null,
    profile.free_access_start
  ];
  const ends = [profile.paid_access_end, profile.free_access_end];
  const upcoming = starts.map((start, i) => {
    const time = Date.parse(start);
    return time > now && time < Date.parse(ends[i]) ? time : Infinity;
  });
  const nextStart = Math.min(...upcoming);
  if (Number.isFinite(nextStart)) {
    return { allowed: false, reason: 'access_scheduled', status: 'ACCESS SCHEDULED', starts_at: new Date(nextStart).toISOString() };
  }
  return { allowed: false, reason: 'payment_required', status: 'PAYMENT REQUIRED' };
}

module.exports = { profileAccess };
