# AfterWorth Admin

Operator console for AfterWorth. Four surfaces — **Invitations**, **Claims**, **Reconciliation**,
**Audit** — each a thin client over the admin RPCs in `afterworth-api`. Next.js 14 (App Router),
`@supabase/ssr`.

**Claims** (Slice C1.5) is a **READ-ONLY** triage of death-claim submissions over
`admin_list_claim_packets_enriched` (estate name, submitter identity, status, and the two evidence
documents' *metadata* — title/uploaded-at, never content). The decide action (approve/reject) is
deliberately **not exposed**: it is gated behind the document-viewer slice (**C1.6**) — a reviewer must
be able to open the death certificate + executor ID before deciding. `admin_decide_claim_packet` is
shipped but UI-unexposed. Approving would not release assets either (release is **C5**, counsel-gated);
the queue marks approved claims "release pending (C5)".

## Security posture (read this first)

- **Two gates in series (edge + app).** Cloudflare Access fronts `admin.minifam.com` (edge identity —
  email-allowlist One-Time PIN), and behind it the app enforces Supabase identity (aal2 + `is_admin`).
  The `*.vercel.app` default door is closed. See **Network exposure** below; the app-level gates that
  follow are the inner, proven boundary.
- **No `service_role` key. Ever.** This app authenticates as the **signed-in admin** and calls
  Supabase RPCs with *their* JWT (publishable/anon key + the user's bearer token). There is no secret
  key in the client, the server components, the middleware, or the env. RLS and every RPC gate apply
  to this app exactly as to any other authenticated caller. `.env` holds only
  `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

- **The gates live inside the RPCs (Posture B).** Every admin RPC (`admin_list_invitations`,
  `admin_list_audit`, `admin_reconciliation_report`, and the write path
  `create/revoke/extend_invitation`) runs its gate **inside the function**:
  `auth.uid()` → `is_admin()` → `require_aal2()` → 15-minute `iat` freshness. A direct PostgREST
  caller (`…/rest/v1/rpc/<fn>`) hits the identical gate — the console buys no privilege the raw door
  doesn't. Consumer RLS is untouched; "admin" is a separate capability axis, not a louder consumer.

- **Middleware is defense-in-depth, not the wall.** `middleware.ts` blocks the obvious cases early
  (no session → `/login`; not aal2 → `/login?stepup=1`; `is_admin()` false → `/forbidden`) so a
  non-admin never sees a surface shell. But it is **convenience**: the real enforcement is in the
  RPCs above. Never move a gate *out* of an RPC and rely on the middleware.

- **aal2 (MFA) is mandatory.** Sign-in is password → TOTP challenge/verify → aal2. An aal1 session
  can reach nothing. The middleware decodes the `aal` claim edge-side (no DB round-trip) to bounce
  aal1 admins into step-up.

- **CSP with a per-request nonce.** `middleware.ts` mints a nonce per request and (in production) emits
  `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `'unsafe-inline'` for scripts). The nonce is
  forwarded on the **request** headers so Next stamps its own bootstrap scripts, and the app is
  `force-dynamic` so the injected nonce always matches the response CSP. `object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. Security headers
  (HSTS, `X-Frame-Options: DENY`, `nosniff`, referrer/permissions policy) come from `next.config.mjs`.
  - **Dev vs prod.** `next dev` Fast Refresh/HMR uses `eval()` and injects un-nonced inline scripts, so
    a strict nonce CSP is incompatible with the dev server. The middleware therefore relaxes `script-src`
    to `'unsafe-inline' 'unsafe-eval'` **only when `NODE_ENV !== 'production'`**; a production build keeps
    the strict nonce. **Prove the strict CSP against `npm run build && npm run start`, never `next dev`.**
  - **Why `next-themes` was removed.** Its FOUC-prevention inline script can't carry the nonce (React
    blanks the `nonce` attribute in SSR), so under the strict prod CSP it was the one blocked script.
    On a security console the CSP console is an **alarm channel** — a permanently-present benign violation
    normalizes the report and could mask a real blocked injection, so it must stay silent by default.
    The console is light-theme only until a nonce-compatible theming approach exists. Verified: a prod
    build now logs **zero** CSP violations while login + all three surfaces work under `'strict-dynamic'`.

- **Every attacker-influenced value is a text node.** Display names, invitee hints, actions,
  user-agents, and the full `metadata`/`detail` JSON all render as React text (auto-escaped) or inside
  `<pre>{JSON.stringify(...)}</pre>`. `dangerouslySetInnerHTML` is **eslint-banned** (`react/no-danger`),
  and no user value is ever placed in an `href`/`src`. `source='ios_forward'` audit rows are
  client-reported and carry an explicit **"untrusted"** badge.

- **The raw invitation token is shown once.** `create_invitation` returns the plaintext token exactly
  once; only its sha256 hash + a 12-char fingerprint are stored. The console holds it in React state,
  displays it in a single modal ("will not be shown again"), and drops it on close — never localStorage,
  never a log.

### Freshness gate — threat-model scope

The 15-minute `iat` check bounds **access-token replay** (a stolen bearer token is useless ~15 min
after issue). It is **not** a session-lifetime limit: a valid refresh token silently mints a fresh
aal2 access token (verified live — refresh preserves `aal2` and advances `iat`), so `rpc()` catches
`stale_token_reauth_required`, refreshes once, and retries with no user prompt. Bounding the *session*
(idle/absolute timeout, device binding) is a separate control, deferred to the CF Access cutover.

## Network exposure — TWO-GATE perimeter (Slice 3.9, done 2026-07-14)

Cloudflare Access fronts the console, so there are now **two gates in series** — an attacker must clear
both:

1. **Edge identity (Cloudflare Access).** `admin.minifam.com` is CF-proxied (orange-cloud) to the Vercel
   project, with a CF Access self-hosted app + an **email-allowlist** policy. An unauthenticated request
   is 302-redirected to the CF Access challenge (One-Time PIN) **before the app is ever reached** — the
   origin serves no HTML pre-auth. Login method is **One-Time PIN** (see the setup footnote below).
2. **App identity (Supabase).** Past the edge, the app's own gate still applies unchanged: session →
   aal2 (MFA) → `is_admin`, enforced inside every RPC. CF Access is the outer perimeter; the Supabase
   gates remain **the** proven security boundary.

**`admin.minifam.com` is the only door — the `*.vercel.app` default is CLOSED.** The old
`afterworth-admin.vercel.app` 307-redirects to `admin.minifam.com` and serves no app HTML. This is the
**load-bearing** step: if the default origin URL still served the app, CF Access would be walkable
straight past it. (Verified by curl: `vercel.app/<path>` → `307 → admin.minifam.com/<path>`.)

**IP authority.** Now that Cloudflare fronts the origin, `CF-Connecting-IP` (not `x-forwarded-for`, which
carries the CF chain) is the authoritative client IP **if the app ever reads it**. Today it does **not** —
a code grep confirmed zero security-relevant client-IP reads (the middleware gates on session/aal2/is_admin,
never on IP; the audit reader only *displays* backend-stamped `audit_logs.ip`). So the switch is a
documented no-op; any future client-IP read (rate-key, allowlist) must use `CF-Connecting-IP`.

**Edge HSTS** is enabled at Cloudflare (max-age 6 months; `includeSubDomains` off, Preload off) to cover
the pre-auth edge hop; the app's own HSTS (from `next.config.mjs`) still covers authenticated responses.

**Future hardening (named, NOT built): Access-JWT as a third gate.** CF injects
`Cf-Access-Jwt-Assertion` on every allowed request. The middleware *could* verify it (fetch the team JWKS
at `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, validate signature + `aud` = the Access app
AUD tag, deny if absent/invalid) as a third gate before the Supabase checks — defense-in-depth only.

> **Setup footnote (CF's June-2026 default-IdP change):** new Cloudflare Zero Trust orgs now default to
> the **Cloudflare IdP**, not One-Time PIN. To get email-PIN access you must **explicitly add One-Time PIN**
> at Zero Trust → Settings → Authentication, then select it on the Access app. (This bit us during setup —
> the account had Cloudflare-IdP as the default.)

## Local development

```
cp .env.example .env.local     # fill URL + publishable key (no secret key), then edit it
npm install
npm run dev                    # http://localhost:3000, against live Supabase (RELAXED dev CSP)
npm run build && npm run lint  # both must be green
npm run start                  # serve the prod build locally to exercise the STRICT CSP
```

> `.env.example` holds only placeholders — do not `cp` it over a populated `.env.local`, and never
> commit the real key (it is gitignored).

Proof matrix: `docs/UNIT4_PROOF.md` (browser legs) + `~/slice3_unit4.sh` (curl legs). The CSP/XSS
leg (D) must be run against `npm run start` (prod build), since `next dev` serves a relaxed CSP.
