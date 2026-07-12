"use client";
import { createClient } from "@/lib/supabase/client";

export type AdminErrorCode =
  | "auth_required"
  | "admin_required"
  | "mfa_required"
  | "stale_token_reauth_required"
  | "owner_or_admin_required"
  | "unknown";

export class AdminRpcError extends Error {
  constructor(public code: AdminErrorCode, message: string) {
    super(message);
    this.name = "AdminRpcError";
  }
}

const KNOWN: AdminErrorCode[] = [
  "auth_required",
  "admin_required",
  "mfa_required",
  "stale_token_reauth_required",
  "owner_or_admin_required"
];

function mapError(err: { message?: string } | null): AdminRpcError {
  const msg = err?.message ?? "unknown";
  const code = (KNOWN.find((c) => msg.includes(c)) ?? "unknown") as AdminErrorCode;
  return new AdminRpcError(code, msg);
}

// Call an admin RPC with the signed-in admin's JWT. The RPC enforces auth -> is_admin -> aal2 ->
// 15-min iat freshness INSIDE the function. On `stale_token_reauth_required`, silently refresh the
// session and retry ONCE (the 15-min gate bounds access-token replay, not session lifetime — a valid
// refresh token restores a fresh token without a password/TOTP prompt). If the refresh itself fails,
// rethrow so the caller prompts a full re-auth.
//
// VERIFIED (Slice 3 UNIT 2c, live decode): refreshSession() preserves aal2 (amr totp+password intact)
// and advances iat past the issue time, so the refreshed token clears the 15-min freshness gate without
// a TOTP prompt. Silent-refresh-then-retry is the correct handler (not a re-step-up).
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = createClient();
  const first = await supabase.rpc(fn, args);
  if (!first.error) return (first.data ?? []) as T;

  const mapped = mapError(first.error);
  if (mapped.code === "stale_token_reauth_required") {
    const { error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) throw mapped; // refresh failed -> caller prompts re-auth
    const retry = await supabase.rpc(fn, args);
    if (retry.error) throw mapError(retry.error);
    return (retry.data ?? []) as T;
  }
  throw mapped;
}
