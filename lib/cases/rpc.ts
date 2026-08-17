"use client";
/**
 * The Phase 11 lifecycle doors, as the console calls them.
 *
 * ★ EVERY CALL GOES THROUGH `lib/rpc.ts`, WHICH SENDS THE SIGNED-IN OPERATOR'S OWN JWT. There is no
 * service_role key in this application and no server-side elevation anywhere in this file. Each
 * routine runs `admin_require_gate()` INSIDE itself — auth → is_admin → AAL2 → 15-minute freshness
 * — so a direct PostgREST caller hits the identical checks and this console buys no privilege the
 * raw door does not already give.
 *
 * ★ THE PARAMETER LISTS ARE THE SAFETY PROPERTY, and what is ABSENT from them matters more than
 * what is present:
 *
 *   · `authorizeRelease` takes an estate and a reason. It does NOT take a reviewer. `reviewer_a` is
 *     derived server-side from the verified case's decider, and reviewer B is `auth.uid()`. A
 *     parameter here would let a caller nominate a first reviewer and satisfy the two-person rule
 *     against someone who never reviewed anything.
 *   · `dispatchOwnerNotice` takes an estate and NO ADDRESS. The recipient is resolved inside the
 *     routine from `auth.users`, where a claimant cannot repoint it.
 *   · Nothing here takes a lifecycle state, a required level, or a window duration. Those are the
 *     server's to decide, and a client that could send them could disagree with the machine.
 */

import { rpc } from "@/lib/rpc";
import type {
  CaseFile,
  CaseQueueRow,
  CaseStatus,
  ReissueResult,
  VerificationLevel,
} from "./types";

export async function listCases(opts: { status?: CaseStatus | null; limit?: number } = {}) {
  return rpc<CaseQueueRow[]>("admin_list_death_verification_cases", {
    p_status: opts.status ?? null,
    p_limit: opts.limit ?? 50,
  });
}

export async function getCase(caseId: string) {
  return rpc<CaseFile>("admin_get_death_verification_case", { p_case: caseId });
}

/** Records the platform's review of ONE evidence item. Moves no verification level, by design. */
export async function reviewEvidence(
  evidenceId: string,
  outcome: "reviewed_accepted" | "reviewed_rejected",
  note: string | null
) {
  return rpc<string>("admin_review_death_evidence", {
    p_evidence: evidenceId,
    p_outcome: outcome,
    p_note: note,
  });
}

/**
 * The ONLY writer of `attained_level`. A separate, separately-audited act from reviewing evidence,
 * so "the file looked right" can never silently become "the death is verified".
 */
export async function setAttainedLevel(caseId: string, level: VerificationLevel, basis: string | null) {
  return rpc<string>("admin_set_attained_verification_level", {
    p_case: caseId,
    p_level: level,
    p_basis: basis,
  });
}

/** Verify or reject. `verify` refuses unless attained >= the LIVE requirement. */
export async function decideCase(caseId: string, decision: "verify" | "reject", note: string | null) {
  return rpc<string>("admin_decide_death_verification_case", {
    p_case: caseId,
    p_decision: decision,
    p_note: note,
  });
}

/** Commits an email row AND an in-app notice, and stamps the challenge clock. No address parameter. */
export async function dispatchOwnerNotice(estateId: string) {
  return rpc<string>("dispatch_owner_safety_notice", { p_estate: estateId });
}

/** Its only legal input is `owner_notification_dispatched` — the un-notified edge was deleted. */
export async function beginChallengeWindow(estateId: string) {
  return rpc<string>("begin_challenge_window", { p_estate: estateId });
}

/** The release. No reviewer parameter — see the header. */
export async function authorizeRelease(estateId: string, reason: string) {
  return rpc<string>("authorize_release", { p_estate: estateId, p_reason: reason });
}

/**
 * Queues a NEW owner-safety notice generation for the CURRENT case episode (Phase 11-OC / Phase C).
 *
 * ★ IT TAKES A CASE AND A REASON, AND THAT LIST IS THE SAFETY PROPERTY.
 *
 *   · NO RECIPIENT. The address is derived inside the routine from `auth.users`, exactly as the
 *     initial dispatch derives it. Re-notice is not a recipient-edit feature, and a parameter here
 *     would turn a remediation control into a way to mail an arbitrary address about someone else's
 *     estate.
 *   · NO GENERATION and NO `reissue_reason` VOCABULARY VALUE. Both are derived server-side — the
 *     generation under the predecessor's row lock, the vocabulary reason from the predecessor's own
 *     status — so an operator cannot relabel an uncertain outcome as a definitive failure.
 *   · NO ESTATE. The episode key is the CASE. An estate parameter would invite a caller to name a
 *     process, and a notice from one death process must never speak for another.
 *
 * ★ A SUCCESSFUL CALL MEANS **NEW WARNING QUEUED**. It is not provider acceptance, not delivery, and
 * not a statement that anyone has been reached. The returned row starts `queued` with a NULL
 * acceptance stamp, and only the drain's `providerAccepted` settlement may ever stamp it.
 */
export async function reissueOwnerNotice(caseId: string, reason: string) {
  return rpc<ReissueResult>("reissue_owner_safety_notice", {
    p_case: caseId,
    p_reason: reason,
  });
}

/** Read-only outbox classification: counts only, never a recipient address. */
export async function ownerNoticeCensus() {
  return rpc<Record<string, unknown>>("owner_notice_census", {});
}
