/**
 * Shapes returned by the Phase 11-K operator projections (afterworth-api migration 0056 /
 * `db/functions/operator_console.sql`).
 *
 * ★ THESE TYPES DESCRIBE WHAT THE SERVER SENDS, NOT WHAT THE CONSOLE WOULD LIKE. Two absences are
 * deliberate and load-bearing, and adding either field here would be the first step of a change
 * that has to happen on the server anyway:
 *
 *   · THERE IS NO RECIPIENT / OWNER EMAIL FIELD. The case file never carries the owner's address;
 *     the queue answers `owner_channel_resolvable` instead. A console that cannot name the type
 *     cannot render it.
 *   · THERE IS NO STORAGE PATH OR DOCUMENT BYTE. Evidence appears as metadata only.
 *
 * ★ EVERY STRING HERE IS ATTACKER-INFLUENCED OR OPERATOR-AUTHORED and is rendered as a TEXT NODE
 * only — estate names, titles, notes and the initiator's own display name all originate outside
 * this console.
 */

/** The policy engine's ladder. Declaration order is the ranking, as in the Postgres enum. */
export const VERIFICATION_LEVELS = ["none", "attestation", "documentary", "enhanced_kyc"] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export type CaseStatus = "open" | "verified" | "rejected" | "cancelled" | "halted";

export type LifecycleState =
  | "active"
  | "death_verification_pending"
  | "death_verified"
  | "owner_notification_dispatched"
  | "challenge_window"
  | "challenge_halted"
  | "released";

export type NoticeStatus =
  | "queued"
  | "processing"
  | "dispatched"
  | "outcomeUncertain"
  | "failedPermanent"
  | "cancelled";

export type EvidenceReviewStatus = "received" | "reviewed_accepted" | "reviewed_rejected";

/** One row of `admin_list_death_verification_cases`. */
export interface CaseQueueRow {
  case_id: string;
  estate_id: string;
  estate_name: string | null;
  case_status: CaseStatus;
  lifecycle_state: LifecycleState;
  event_type: string;
  initiated_at: string;
  updated_at: string;
  initiator_capacity: string | null;
  jurisdiction_context: string | null;
  required_level: VerificationLevel;
  attained_level: VerificationLevel | null;
  evidence_total: number;
  evidence_awaiting_review: number;
  /** Whether dispatch will be able to resolve an address — never the address itself. */
  owner_channel_resolvable: boolean;
  decided_at: string | null;
}

export interface CaseFileEvidence {
  evidence_id: string;
  document_id: string;
  title: string | null;
  doc_type: string | null;
  uploaded_at: string | null;
  submitted_at: string;
  review_status: EvidenceReviewStatus;
  reviewed_at: string | null;
  review_note: string | null;
}

export interface CaseFileNotice {
  id: string;
  channel: string;
  notice_kind: string;
  status: NoticeStatus;
  requested_at: string;
  dispatched_at: string | null;
  attempts: number;
  failure_class: string | null;
}

/** The whole payload of `admin_get_death_verification_case`. */
export interface CaseFile {
  case: {
    case_id: string;
    estate_id: string;
    estate_name: string | null;
    status: CaseStatus;
    event_type: string;
    initiated_at: string;
    updated_at: string;
    initiator_capacity: string | null;
    jurisdiction_context: string | null;
    /** What policy required when the case opened — a record, never the bar. */
    required_level_at_initiation: VerificationLevel;
    /** What policy requires NOW — the bar the decision routine will apply. */
    required_level_live: VerificationLevel;
    attained_level: VerificationLevel | null;
    decided_at: string | null;
    decision_note: string | null;
  };
  initiator: {
    user_id: string;
    email: string | null;
    name: string | null;
    capacity: string | null;
  };
  lifecycle: {
    state: LifecycleState;
    owner_notified_at: string | null;
    challenge_window_started_at: string | null;
    halted_at: string | null;
    released_at: string | null;
    updated_at: string | null;
  };
  window: {
    duration: string | null;
    configured: boolean;
    release_eligible_at: string | null;
    elapsed: boolean;
  };
  owner_notice: CaseFileNotice[];
  evidence: CaseFileEvidence[];
  release: {
    reviewer_a: string | null;
    /**
     * Derived by the SERVER from `auth.uid()`. The console renders it and never computes it — see
     * `lib/cases/lifecycle.ts`.
     */
    viewer_is_reviewer_a: boolean;
    authorized: {
      authorized_at: string;
      reviewer_a: string;
      reviewer_b: string;
      audit_reason: string;
    } | null;
  };
}
