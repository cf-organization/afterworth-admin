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

/**
 * Every reason the server will refuse a RELEASE on owner-notice grounds, as the server names them
 * (Phase 11-OC / Phase D).
 *
 * ★ THE SAME DISCIPLINE AS `ReissueRefusalCode`, ON A HIGHER-STAKES DOOR. This union mirrors a
 * server vocabulary and decides nothing: `owner_notice_release_authority` decides, the case file
 * carries its verdict, and `authorize_release` re-checks independently every time. What lives on
 * the client is the OPERATOR COPY, which is the console's own job.
 *
 * ★ `notice_never_accepted` IS NOT `notice_not_delivered`, AND THE NAMING IS LOAD-BEARING. What the
 * database knows is whether the email PROVIDER ACCEPTED the message. Mailbox delivery is not
 * observed by this product at all, so a code — or a sentence — claiming it would be the console
 * inventing the one fact this phase exists to stop being invented.
 */
export type ReleaseRefusalCode =
  | "case_not_found"
  | "no_verified_case"
  | "notice_episode_mismatch"
  | "invalid_release_state"
  | "no_current_notice"
  | "notice_never_accepted"
  | "release_window_not_configured"
  | "release_window_not_elapsed";

/**
 * The server's verdict on whether the owner-notice preconditions for a release are met, computed by
 * the SAME function `authorize_release` consults.
 *
 * ★ IT IS NOT A PERMISSION, AND THE FIELDS IT DOES NOT HAVE SAY SO. There is no reviewer identity,
 * no admin flag and no recipient address on any branch. The two-person rule, the admin gate and the
 * audit reason are all re-checked inside the routine; this makes the affordance TRUTHFUL and grants
 * nothing.
 */
export interface ReleaseAuthority {
  ready: boolean;
  refusal_code: ReleaseRefusalCode | null;
  case_id: string;
  case_is_current: boolean;
  lifecycle_state: LifecycleState;
  notice_id: string | null;
  generation: number | null;
  notice_kind: string | null;
  /** PROVIDER ACCEPTANCE, never mailbox delivery. NULL is a real answer and must render as one. */
  notice_accepted_at: string | null;
  accepted: boolean;
  window_duration: string | null;
  window_configured: boolean;
  /** Anchored on the acceptance fact. NULL until there is one — never derived from provenance. */
  release_eligible_at: string | null;
  elapsed: boolean;
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
  /**
   * ★ PHASE 11-OC / PHASE D — THESE ARE NOW PROJECTIONS OF `release_authority`, NOT A SECOND CLOCK.
   * The shape is unchanged so an older console keeps parsing, but `release_eligible_at` is anchored
   * on `notice_accepted_at` rather than on `owner_notified_at`, and is NULL until there is an
   * acceptance fact to anchor on. A client that filled that NULL in from the lifecycle timestamp
   * would show an operator a deadline the server does not recognise.
   */
  window: {
    duration: string | null;
    configured: boolean;
    release_eligible_at: string | null;
    elapsed: boolean;
  };
  owner_notice: CaseFileNotice[];
  /**
   * Server-calculated release authority (Phase 11-OC / Phase D). The console offers AUTHORIZE
   * RELEASE only when this says `ready`, so the two cannot drift on the one irreversible door.
   *
   * ★ OPTIONAL, AND THAT IS A FAIL-CLOSED DECISION. A server that predates Phase D does not project
   * it; `availability` must then produce an UNAVAILABLE control rather than fall back to the local
   * mirror it used to keep. Assuming availability when the server has said nothing is how a console
   * offers an irreversible action against a routine that may not be deployed.
   */
  release_authority?: ReleaseAuthority;
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
