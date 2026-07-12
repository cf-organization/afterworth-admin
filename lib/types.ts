// Shapes returned by the admin RPCs (afterworth-api 0015/0016/0018). All attacker-influenced string
// fields (display names, hints, action, metadata, reason, user_agent) are rendered as TEXT NODES only.

export interface Invitation {
  id: string;
  estate_id: string;
  estate_display_name: string | null;
  kind: string;
  proposed_role: string;
  status: string;
  invitee_email_hint: string | null;
  invitee_phone_hint: string | null;
  inviter_display_name: string | null;
  expires_at: string;
  is_expired: boolean;
  created_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  token_fingerprint: string; // 12-char; the raw token is never returned by any read RPC
}

export interface CreatedInvitation {
  invitation_id: string;
  raw_token: string; // shown ONCE in the UI, never persisted/logged
  token_fingerprint: string;
  expires_at: string;
}

export interface ReconciliationRow {
  issue: string;
  estate_id: string;
  ref_id: string;
  detail: Record<string, unknown>;
}

export interface AuditRow {
  id: number;
  actor_id: string;
  estate_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  source: string; // 'server' | 'ios_forward' | 'admin'
}
