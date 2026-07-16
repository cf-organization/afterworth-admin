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

// afterworth-api 0028 admin_list_claim_packets_enriched — the DISPLAY-RESOLVED claims queue. Keyset on
// (submitted_at, id) desc. estate_name + submitter_* are attacker-influenced -> rendered as text nodes.
// The two doc_* groups are METADATA ONLY (title/doc_type/uploaded_at) — no content/URL; viewing is C1.6, and
// the DECIDE action (approve/reject) is gated behind it, so this surface is READ-ONLY.
export interface EnrichedClaimPacket {
  id: string;
  estate_id: string;
  estate_name: string | null;
  requested_by: string;
  submitter_email: string | null;
  submitter_name: string | null;
  status: string;
  submitted_at: string;
  decided_at: string | null;
  reviewer_id: string | null;
  reviewer_email: string | null;
  review_notes: string | null;
  death_certificate_doc_id: string | null;
  death_cert_title: string | null;
  death_cert_doc_type: string | null;
  death_cert_uploaded_at: string | null;
  executor_id_doc_id: string | null;
  executor_id_title: string | null;
  executor_id_doc_type: string | null;
  executor_id_uploaded_at: string | null;
}
