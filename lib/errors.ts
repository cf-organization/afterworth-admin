import { AdminRpcError } from "@/lib/rpc";

// Humanize an RPC failure into an operator-readable line. The gate codes come back as the raw exception
// string (e.g. "admin_required"); the invitation RPCs raise domain codes (e.g. "pending_invitation_cap").
// We recognize a known set and otherwise fall through to the raw message — never a blank error.
const FRIENDLY: Record<string, string> = {
  // admin_require_gate / invitation_write_gate
  auth_required: "Your session has expired. Sign in again.",
  admin_required: "This account is not an administrator.",
  mfa_required: "Two-factor authentication is required for this action.",
  owner_or_admin_required: "You must be the estate owner or an administrator.",
  stale_token_reauth_required: "Your session needs to refresh. Try again.",
  // create_invitation
  invitee_contact_required: "Provide an invitee email or phone number.",
  kind_not_yet_supported: "That invitation kind is not supported yet (beneficiary / professional only).",
  invalid_expiry: "Expiry must be between 1 and 90 days.",
  pending_invitation_cap: "This estate has reached its cap of 20 active invitations.",
  // revoke / extend
  invitation_not_found: "That invitation no longer exists.",
  invitation_lifetime_exceeded: "This invitation has exceeded its 90-day lifetime — mint a new one.",
};

export function humanizeError(err: unknown): string {
  const raw = err instanceof AdminRpcError ? err.message : err instanceof Error ? err.message : String(err);
  if (FRIENDLY[raw]) return FRIENDLY[raw];
  // cannot_revoke_<status> / cannot_extend_<status>
  const m = /^cannot_(revoke|extend)_(.+)$/.exec(raw);
  if (m) return `Cannot ${m[1]} an invitation that is already ${m[2]}.`;
  return raw || "Something went wrong.";
}
