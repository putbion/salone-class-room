const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  baseHeaders,
  getHeader,
  clientIp,
  fingerprint,
  rateLimit,
  enforceRate,
  bodyTooLarge,
  verifyOrigin,
  isBotSubmission,
  sanitizeAIOutput
} = require('../netlify/functions/_security');

describe('Security Utility Functions', () => {
  test('baseHeaders includes mandatory hardening headers', () => {
    assert.equal(baseHeaders['X-Content-Type-Options'], 'nosniff');
    assert.equal(baseHeaders['X-Frame-Options'], 'DENY');
    assert.equal(baseHeaders['Content-Type'], 'application/json');
    assert.ok(baseHeaders['Cache-Control'].includes('no-store'));
    assert.ok(baseHeaders['Cache-Control'].includes('no-cache'));
    assert.equal(baseHeaders['Pragma'], 'no-cache');
  });

  test('getHeader retrieves headers case-insensitively', () => {
    const event = {
      headers: {
        'Authorization': 'Bearer test-token',
        'X-Admin-Token': 'admin-secret',
        'content-type': 'application/json'
      }
    };
    assert.equal(getHeader(event, 'authorization'), 'Bearer test-token');
    assert.equal(getHeader(event, 'AUTHORIZATION'), 'Bearer test-token');
    assert.equal(getHeader(event, 'x-admin-token'), 'admin-secret');
    assert.equal(getHeader(event, 'Content-Type'), 'application/json');
    assert.equal(getHeader(event, 'nonexistent'), '');
  });

  test('clientIp handles multiple formats safely', () => {
    assert.equal(clientIp({ headers: { 'x-nf-client-connection-ip': '197.234.12.5' } }), '197.234.12.5');
    assert.equal(clientIp({ headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1' } }), '10.0.0.1');
    assert.equal(clientIp({ headers: { 'client-ip': '::1' } }), '::1');
    assert.equal(clientIp({ headers: {} }), 'unknown');
  });

  test('verifyOrigin allows legitimate origins and rejects unauthorized cross-origin requests', () => {
    assert.equal(verifyOrigin({ headers: { 'origin': 'https://www.saloneclassroom.com' } }), true);
    assert.equal(verifyOrigin({ headers: { 'origin': 'https://saloneclassroom.com' } }), true);
    assert.equal(verifyOrigin({ headers: { 'origin': 'http://localhost:8888' } }), true);
    assert.equal(verifyOrigin({ headers: { 'origin': 'https://preview-123.netlify.app' } }), true);
    assert.equal(verifyOrigin({ headers: {} }), true); // non-cross-origin direct call

    // Malicious or unauthorized origin
    assert.equal(verifyOrigin({ headers: { 'origin': 'https://evil-attacker.com' } }), false);
    assert.equal(verifyOrigin({ headers: { 'origin': 'https://malicious-site.org' } }), false);
    assert.equal(verifyOrigin({ headers: { 'origin': 'javascript:alert(1)' } }), false);
  });

  test('isBotSubmission correctly detects honeypot fields', () => {
    assert.equal(isBotSubmission({ website: 'http://spam-link.com' }), true);
    assert.equal(isBotSubmission({ hp_check: 'spammer' }), true);
    assert.equal(isBotSubmission({ address_confirm: 'fake bot' }), true);

    // Legitimate submissions with empty or missing honeypots
    assert.equal(isBotSubmission({ full_name: 'John Doe', contact: '+23276123456' }), false);
    assert.equal(isBotSubmission({ website: '', address_confirm: '   ' }), false);
    assert.equal(isBotSubmission(null), false);
  });

  test('sanitizeAIOutput strips executable and dangerous markup', () => {
    const malicious = 'Here is your lesson: <script>alert("xss")</script> and <iframe src="javascript:evil()"></iframe><object data="bad"></object>';
    const cleaned = sanitizeAIOutput(malicious);
    assert.ok(!cleaned.includes('<script>'));
    assert.ok(!cleaned.includes('</script>'));
    assert.ok(!cleaned.includes('<iframe'));
    assert.ok(!cleaned.includes('javascript:'));
    assert.ok(!cleaned.includes('<object'));
    assert.ok(cleaned.includes('Here is your lesson:'));
  });

  test('bodyTooLarge detects oversized payloads', () => {
    assert.equal(bodyTooLarge({ body: 'small' }, 100), false);
    assert.equal(bodyTooLarge({ body: 'a'.repeat(200) }, 100), true);
  });

  test('rateLimit enforces request limits and retryAfter', () => {
    const mockEvent = { headers: { 'client-ip': '1.2.3.4' } };
    const opts = { name: 'test-limit', limit: 3, windowMs: 10000, key: 'test-ip-1' };

    const r1 = rateLimit(mockEvent, opts);
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 2);

    const r2 = rateLimit(mockEvent, opts);
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 1);

    const r3 = rateLimit(mockEvent, opts);
    assert.equal(r3.allowed, true);
    assert.equal(r3.remaining, 0);

    const r4 = rateLimit(mockEvent, opts);
    assert.equal(r4.allowed, false);
    assert.ok(r4.retryAfter > 0);

    const response = enforceRate(mockEvent, opts);
    assert.equal(response.statusCode, 429);
    assert.ok(response.headers['Retry-After']);
  });
});
