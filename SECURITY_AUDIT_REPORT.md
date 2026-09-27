# Salone Class Room Security Hardening Report

Date: 12 September 2026

## Scope reviewed
- `index.html`
- `admin.html`
- `netlify.toml`
- All Netlify Functions in `netlify/functions/`

## High-risk issues fixed
1. Disabled the legacy unauthenticated `ai.js` endpoint that could be abused to consume paid AI API quota without platform authentication/access controls.
2. Replaced client-controlled anonymous trial identity with a server-derived HMAC fingerprint so changing `localStorage` device IDs no longer trivially resets the free trial.
3. Moved learner and administrator bearer tokens from persistent `localStorage` to tab-scoped `sessionStorage`, while clearing legacy token copies.
4. Removed password hashes/salts from the administrator API response so credential-verifier material is not exposed to the browser.
5. Added throttling to admin login, user login, registration, password reset requests, support messages, AI generation, public event logging, curriculum lookup, payment requests and webhook traffic.
6. Added request-body size limits to reduce oversized-request/resource-exhaustion attacks.
7. Closed the unused unauthenticated `tool_use` database-write route.
8. Disabled the Orange Money webhook placeholder from accepting a callback as successful until cryptographic/provider verification is actually implemented.
9. Removed detailed Supabase registration diagnostics from public error responses.

## Browser/XSS hardening
- Added deployment security headers: CSP, clickjacking protection, MIME-sniffing protection, HSTS, referrer restrictions, permissions restrictions, COOP/CORP, and no-store caching.
- Removed the unused third-party Supabase browser script from the admin page.
- Encoded dynamic IDs/emails inserted into admin inline event handlers.
- Hardened several dynamic HTML render paths by escaping user-controlled text.
- Retained safe escaping of AI-generated text before formatted HTML rendering.

## Authentication/password hardening
- Raised new account and temporary administrator password minimum to 12 characters, maximum 128.
- Added browser input limits/autocomplete hints.
- Reduced custom learner session lifetime from 90 days to 7 days.
- Added brute-force throttling for administrator and learner login attempts.
- Changed unauthorized admin-login responses to a generic credential error to reduce administrator-account enumeration.

## API/database hardening
- Added task and education-level allowlists for the learning API.
- Sanitized curriculum search terms before embedding them in PostgREST filters.
- Added an allowlist for public event types (`page_view` only).
- Added an allowlist for payment status changes.
- Kept Supabase service-role credentials server-side only.

## Support/comment fix
- Replaced the external FormSubmit form action with the site's protected `support-message` Netlify Function.
- Added direct JavaScript submission, validation, limits and user-visible success/error handling.
- Support messages remain stored in Supabase and email delivery uses Resend when configured.

## Important deployment requirements
The code is materially harder to abuse, but no web application can be guaranteed immune from every future attack. Before production use:

- Set a strong random `VISITOR_FINGERPRINT_SECRET` in Netlify Environment Variables (at least 32 random bytes). If absent, the function falls back to the Supabase service-role secret for HMAC derivation, but a dedicated secret is preferred.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `RESEND_API_KEY`, Orange Money secrets and administrator credentials only in Netlify environment variables / Supabase Auth, never in HTML or GitHub.
- Configure `RESEND_API_KEY`, `SUPPORT_FROM_EMAIL`, and `SUPPORT_TO_EMAIL` for reliable direct support email delivery.
- Do not enable Orange Money API mode until the callback/webhook signature/token verification is implemented from official Orange documentation.
- Review Supabase database constraints/RLS separately. The supplied project does not include a complete SQL schema/policy export, so database-side RLS and unique constraints could not be fully audited here.
- Enable MFA for Netlify, GitHub, Supabase, Resend, Groq/DeepSeek, and the administrator email account.
- Turn on Netlify/GitHub branch protection, secret scanning, dependency/security alerts, and access logs where available.

## Residual limitations
- The current HTML architecture uses many inline scripts, inline styles and inline `onclick` handlers. Because of this, the CSP must still permit `'unsafe-inline'`. A future refactor should move JavaScript into external files and replace inline handlers with `addEventListener`, allowing a strict nonce/hash-based CSP.
- In-memory function throttling is useful defense-in-depth but is not a globally synchronized distributed rate limiter across every serverless instance. For stronger protection at scale, add provider-level/WAF rate limiting or a shared rate-limit datastore.
- Authentication for ordinary learners is custom (scrypt hashes + custom sessions) rather than a managed identity provider. It is hardened here, but migrating learners to Supabase Auth would reduce custom authentication surface area.
