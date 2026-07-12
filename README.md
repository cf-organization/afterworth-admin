# AfterWorth Admin

Operator console for AfterWorth. Three surfaces — **Invitations**, **Reconciliation**, **Audit** —
each a thin client over the admin RPCs in `afterworth-api`. Next.js 14 (App Router), `@supabase/ssr`.

## Security posture (read this first)

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

- **CSP with a per-request nonce.** `middleware.ts` mints a nonce per request and emits
  `script-src 'self' 'nonce-…' 'strict-dynamic'` (no `'unsafe-inline'` for scripts). The nonce is
  forwarded on the **request** headers so Next stamps its own bootstrap scripts, and the app is
  `force-dynamic` so the injected nonce always matches the response CSP. `object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. Security headers
  (HSTS, `X-Frame-Options: DENY`, `nosniff`, referrer/permissions policy) come from `next.config.mjs`.

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

## Network exposure — current and planned

**Now:** the app is protected by its **auth gates only** (aal2 admin, gates in the RPCs). There is no
network allowlist in front of it yet.

**Slice 3.9 — Cloudflare Access cutover (pending):** front the deployment with CF Access (SSO + device
posture) so the app is unreachable pre-auth. Two riders that MUST land with it:
1. **IP authority flips.** Today Vercel's edge sets `x-forwarded-for` to the client IP. Once Cloudflare
   fronts the origin, `CF-Connecting-IP` becomes authoritative and XFF carries the CF chain — anything
   reading client IP must switch. (Mirrors the rate-limiter's XFF note in `afterworth-api`.)
2. **Close the default domain.** The default `*.vercel.app` URL must be redirected/disabled at cutover,
   or CF Access is walkable straight past (the origin stays publicly reachable on its Vercel hostname).

## Local development

```
cp .env.example .env.local     # fill URL + publishable key (no secret key)
npm install
npm run dev                    # http://localhost:3000, against live Supabase
npm run build && npm run lint  # both must be green
```

Proof matrix: `docs/UNIT4_PROOF.md` (browser legs) + `~/slice3_unit4.sh` (curl legs).
