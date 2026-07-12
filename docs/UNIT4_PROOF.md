# Slice 3 · UNIT 4 — proof matrix

Two kinds of legs. The **curl legs** (A-rpc, B-rpc, D-headers, F) run from `~/slice3_unit4.sh`
and prove the RPC **doors** directly through PostgREST — the app is only an outer layer, so a
direct caller must hit the same gates. The **browser legs** below prove the app's own behavior
(middleware redirects, one-time token, inert XSS, storage hygiene). The freshness **gate** (C) is
proven deterministically in the SQL editor with a crafted `iat`; the app's silent-refresh
**recovery** is backed by the UNIT-2c live decode.

Run the app first (points at live Supabase; nothing is deployed until SHIP):

```
cd afterworth-admin && npm run dev      # http://localhost:3000
```

| Leg | What it proves | Where |
|-----|----------------|-------|
| A   | non-admin: middleware → `/forbidden`; RPC door → `admin_required` | browser + `slice3_unit4.sh` |
| B   | admin aal1: middleware → step-up; RPC door → `mfa_required` | browser + `slice3_unit4.sh` |
| C   | stale token → `stale_token_reauth_required`; app silently refreshes | SQL DO-block + browser |
| D   | hostile estate name renders **inert**; CSP/HSTS headers present | browser + `slice3_unit4.sh` |
| E   | raw token shown **once**, absent from browser storage | browser |
| F   | create → live preview → revoke → `is_revoked` → bind = **P0004** | `slice3_unit4.sh` |

Run the curl legs:

```
bash ~/slice3_unit4.sh
```

Paste its output under **Curl legs** at the bottom.

---

## Browser legs (you drive)

### A — non-admin is walled off
1. Sign in at `/login` as a **non-admin** (`ckankeu2@gmail.com`) — password, then TOTP if prompted, to reach aal2.
2. Navigate to `/invitations`.
   - **Expect:** the page renders `/forbidden` ("You do not have access"), URL stays `/invitations` (middleware `rewrite`, not redirect). The three surfaces never load.
3. (The RPC-door half is leg A in the script: the same account's JWT → `admin_list_invitations` → **403 `admin_required`**.)

### B — admin at aal1 is forced to step up
1. Sign out. At `/login`, enter the **admin** email + password, and **stop** — do not complete TOTP yet. (If the login screen advances straight to the TOTP prompt, that itself is the step-up; complete it to continue.)
2. With an aal1 session, manually visit `/invitations`.
   - **Expect:** bounced to `/login?stepup=1`, which immediately shows the **authenticator code** prompt (no password re-entry).
3. Enter a fresh TOTP code.
   - **Expect:** lands on `/invitations`; all three surfaces load. (RPC-door half = leg B: admin aal1 JWT → **403 `mfa_required`**.)

### C — token freshness gate + silent refresh
**Gate (deterministic, SQL editor).** A single `DO` block (autocommit-safe — one statement) crafts a
stale `request.jwt.claims` and calls the RPC. `auth.uid()`/`auth.jwt()` read the GUC even inside a
SECURITY DEFINER function, so the gate runs exactly as for a real caller:

```sql
do $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub',  '16db5021-4870-4d66-9d71-0b73d72363d0',   -- the admin's uid (is_admin() → true)
    'role', 'authenticated',
    'aal',  'aal2',                                     -- passes require_aal2()
    'iat',  (extract(epoch from now())::bigint - 1000) -- 1000s old → fails the 15-min gate
  )::text, true);
  begin
    perform * from public.admin_list_invitations(p_limit => 1);
    raise notice 'UNEXPECTED: gate did not fire';
  exception when others then
    raise notice 'gate fired: SQLSTATE=% MESSAGE=%', sqlstate, sqlerrm;
  end;
end $$;
```
- **Expect (Notices):** `gate fired: SQLSTATE=42501 MESSAGE=stale_token_reauth_required`.
- Sanity: change `- 1000` to `- 100` (well within 15 min) and it returns rows with no error.

**Recovery (app).** The `rpc()` helper catches `stale_token_reauth_required`, calls `refreshSession()`,
and retries once. UNIT-2c proved live that `refreshSession()` keeps `aal2` and advances `iat`, so the
retry clears the gate with no prompt. To watch it: keep `/invitations` open past the access-token
lifetime (~1h) — or in DevTools console run `await window.__nextClient?.…` is unnecessary; simply wait
for a natural token refresh — then click **Apply**. **Expect:** the list reloads with no re-login.

### D — hostile estate name renders inert
1. In the SQL editor, capture and then poison a test estate's name (write the original down!):
   ```sql
   select id, name from public.estates where id = '9add2645-b3ef-4c25-b315-63900833ba5a';  -- record `name`
   update public.estates set name = '<img src=x onerror=alert(1)>'
     where id = '9add2645-b3ef-4c25-b315-63900833ba5a';
   ```
2. In the app, create an invitation for that estate (any type/expiry). `create_invitation` copies the
   estate name into `estate_display_name`; the admin list shows it unconditionally.
3. Open `/invitations`.
   - **Expect:** the Estate cell shows the **literal text** `<img src=x onerror=alert(1)>`. **No alert fires.** In DevTools → Elements, the cell contains an escaped text node (`&lt;img …&gt;`), **not** an `<img>` element.
4. **Restore the name immediately:**
   ```sql
   update public.estates set name = '<ORIGINAL NAME>'
     where id = '9add2645-b3ef-4c25-b315-63900833ba5a';
   ```
   (Non-destructive alternative — skip the estate mutation and forward one `ios_forward` audit row with
   hostile `metadata`, then view `/audit`: the JSON renders inside `<pre>` as inert text and the row
   carries the "untrusted" badge.)
5. Headers are leg D in the script (`curl -I`), asserting `content-security-policy` (with `nonce-`),
   `strict-transport-security`, `x-frame-options`, `x-content-type-options`.

### E — raw token shown once, never stored
1. Create an invitation. The success modal shows the **full raw token** with a copy button and
   "it will not be shown again."
2. Copy it, click **Done**.
   - **Expect:** the list shows only the 12-char **fingerprint**, never the raw token.
3. Reopen the same invitation's row actions — there is no way to see the token again.
4. DevTools → Application → Local Storage / Session Storage / IndexedDB.
   - **Expect:** the raw token string is **absent** everywhere (only the Supabase auth session is stored). It lived only in React state and is gone after the modal closed.

---

## Evidence

### Curl legs (`slice3_unit4.sh` output)
```
(paste here)
```

### Browser legs
- **A** — /invitations as non-admin → _forbidden?_ ______
- **B** — aal1 admin → step-up bounce → surfaces load? ______
- **C** — SQL notice line: ______   ; app reload after refresh no re-login? ______
- **D** — estate cell literal text, no alert, escaped in Elements? ______
- **E** — token shown once; absent from storage? ______
```
```
