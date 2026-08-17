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

/**
 * ★ PHASE 11-OC · PHASE A/C — A NOTICE IS A GENERATION OF AN EPISODE, NOT A LONE ROW.
 *
 * Four of these fields exist because `status` alone cannot answer the question this console is for.
 * `dispatched` means "the email provider accepted this message" on a row written after Phase A, and
 * means "nobody knows, the stamp did not exist yet" on a row written before it. A console that
 * rendered both the same way would state, on the one screen where it matters most, that a living
 * owner was reached when nobody knows whether they were.
 *
 *   · `notice_accepted_at` — THE FACT. Written by exactly one branch of one server routine
 *     (`providerAccepted`). NULL is a real answer and is rendered as one, never smoothed away.
 *   · `case_id` / `generation` — which episode, and which attempt within it. NULL `case_id` is a
 *     pre-Phase-A row that belongs to no provable episode.
 *   · `superseded_by` / `is_current` — a retired generation and a live one must never be shown with
 *     the same weight. `is_current` is projected by the server rather than derived here from a null
 *     check, because a null check is exactly the derivation a UI gets wrong once and then keeps.
 */
export interface CaseFileNotice {
  id: string;
  channel: string;
  notice_kind: string;
  status: NoticeStatus;
  requested_at: string;
  dispatched_at: string | null;
  attempts: number;
  failure_class: string | null;
  case_id: string | null;
  generation: number;
  superseded_by: string | null;
  is_current: boolean;
  /** The instant the PROVIDER accepted this specific message. Never delivery, never a read receipt. */
  notice_accepted_at: string | null;
  claimed_at: string | null;
}

/**
 * Every reason the server will refuse a re-notice, as the server names them.
 *
 * ★ THIS UNION IS A MIRROR OF A SERVER VOCABULARY, AND IT IS DELIBERATELY NOT A POLICY. The console
 * never decides eligibility — `owner_notice_reissue_assessment` does, and the case file carries its
 * verdict. What lives here is the OPERATOR COPY for each code, which is the console's own job. The
 * server owns the rule; the client owns the sentence.
 */
export type ReissueRefusalCode =
  | "case_not_found"
  | "no_verified_case"
  | "case_not_current"
  | "invalid_reissue_state"
  | "no_current_notice"
  | "notice_still_queued"
  | "notice_still_processing"
  | "notice_already_accepted"
  | "notice_cancelled"
  | "notice_not_reissuable"
  | "owner_channel_unreachable";

/**
 * The server's verdict on whether this episode may be re-noticed, computed by the SAME function
 * `reissue_owner_safety_notice` consults. The console renders it and never recomputes it.
 */
export interface ReissueVerdict {
  eligible: boolean;
  refusal_code: ReissueRefusalCode | null;
  case_is_current: boolean;
  lifecycle_state: LifecycleState;
  owner_channel_resolvable: boolean;
  prior_notice_id: string | null;
  prior_generation: number | null;
  prior_status: NoticeStatus | null;
  prior_notice_kind: string | null;
  prior_failure_class: string | null;
  prior_accepted: boolean;
  next_generation: number | null;
  reissue_reason: string | null;
}

/** What `reissue_owner_safety_notice` returns. There is no recipient field, on any branch. */
export interface ReissueResult {
  status: "queued";
  case_id: string;
  notice_id: string;
  generation: number;
  notice_kind: string;
  notice_accepted_at: null;
  reissue_reason: string;
  prior_notice_id: string;
  prior_generation: number;
  prior_status: NoticeStatus;
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
  /**
   * Server-calculated action availability for the Phase C re-notice. NOT a local mirror: the console
   * offers the control iff this says `eligible`, so the two cannot drift.
   */
  owner_notice_reissue: ReissueVerdict;
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
