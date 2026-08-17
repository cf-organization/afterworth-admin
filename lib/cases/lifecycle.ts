/**
 * What the lifecycle PERMITS, and what the operator must be told about it.
 *
 * ★ THIS FILE DECIDES WHAT TO DISPLAY. IT DECIDES NOTHING ABOUT AUTHORIZATION. Every function here
 * answers "would this action be accepted right now, and if not, why not" — so the console can show
 * an action where it is meaningful and explain its absence where it is not. The server decides
 * whether the action actually happens, every single time, inside the routine's own gate. If this
 * file were deleted the console would be confusing and the system would be exactly as safe.
 *
 * That distinction is not a comment, it is the design: a reviewer reading this file should be able
 * to satisfy themselves that no security property depends on it. UI affordance is not permission.
 *
 * ★ THE PRECONDITIONS MIRROR THE DEPLOYED ROUTINES ONE FOR ONE, and the mirroring is checked by
 * `lib/cases/__tests__/lifecycle.test.ts` against the sentinels those routines raise. A console
 * that offered an action the door refuses would train operators to ignore errors; a console that
 * hid an action the door would accept would look broken. Both are worse than being strict.
 */

import type {
  CaseFile,
  CaseFileNotice,
  LifecycleState,
  ReissueRefusalCode,
  VerificationLevel,
} from "./types";
import { VERIFICATION_LEVELS } from "./types";

export type ActionId =
  | "review_evidence"
  | "set_attained_level"
  | "decide_case"
  | "dispatch_owner_notice"
  | "begin_challenge_window"
  | "authorize_release";

export interface ActionAvailability {
  readonly available: boolean;
  /**
   * Why the action is unavailable, in operator language. Present iff `available` is false.
   * Describes the LIFECYCLE, never a permission — "this case has not been verified" rather than
   * "you are not allowed".
   */
  readonly reason?: string;
}

const UNAVAILABLE = (reason: string): ActionAvailability => ({ available: false, reason });
const AVAILABLE: ActionAvailability = { available: true };

/** Rank on the policy engine's ladder. Unknown values rank lowest — fail closed, never fail open. */
export function levelRank(level: VerificationLevel | null): number {
  if (level === null) return -1;
  const i = VERIFICATION_LEVELS.indexOf(level);
  return i === -1 ? -1 : i;
}

/**
 * Does the attained level meet the LIVE requirement? Mirrors
 * `admin_decide_death_verification_case`, which re-derives the requirement at decision time and
 * coalesces a NULL attained level to refusal.
 */
export function meetsRequirement(file: CaseFile): boolean {
  const attained = levelRank(file.case.attained_level);
  if (attained < 0) return false;
  return attained >= levelRank(file.case.required_level_live);
}

/**
 * Is there a committed, non-cancelled email row? This is the exact predicate
 * `begin_challenge_window` and `authorize_release` both apply — and note what it is NOT: it does
 * not require `dispatched`. The deployed contract is DISPATCH INITIATION, so a `queued` notice
 * satisfies the door. The console must agree with the door here and say something different to the
 * operator about delivery; see `noticeDeliveryLabel`.
 */
export function hasCommittedNotice(file: CaseFile): boolean {
  return file.owner_notice.some((n) => n.channel === "email" && n.status !== "cancelled");
}

export function availability(action: ActionId, file: CaseFile): ActionAvailability {
  const state: LifecycleState = file.lifecycle.state;
  const status = file.case.status;

  switch (action) {
    case "review_evidence":
      // admin_review_death_evidence refuses anything already reviewed; the per-item control is
      // rendered per evidence row. At case level it is meaningful only while the case is open.
      return status === "open"
        ? AVAILABLE
        : UNAVAILABLE(`This case is ${status}. Evidence can only be reviewed while it is open.`);

    case "set_attained_level":
      // admin_set_attained_verification_level: `case_not_open`.
      return status === "open"
        ? AVAILABLE
        : UNAVAILABLE(`This case is ${status}. The attained level can only be set while it is open.`);

    case "decide_case":
      if (status !== "open") {
        return UNAVAILABLE(`This case is ${status}. A decided case cannot be decided again.`);
      }
      return AVAILABLE;

    case "dispatch_owner_notice":
      // dispatch_owner_safety_notice: `invalid_dispatch_state` unless death_verified.
      if (state === "owner_notification_dispatched") {
        return UNAVAILABLE("The owner notice has already been dispatched for this estate.");
      }
      if (state !== "death_verified") {
        return UNAVAILABLE(
          `The estate is ${state}. The owner notice is dispatched only from death_verified.`
        );
      }
      return AVAILABLE;

    case "begin_challenge_window":
      // begin_challenge_window: `invalid_window_state` unless owner_notification_dispatched. The
      // death_verified -> challenge_window edge was DELETED in 11-F, so a window cannot open on an
      // un-notified owner even by mistake.
      if (state === "challenge_window") {
        return UNAVAILABLE("The challenge window is already open.");
      }
      if (state !== "owner_notification_dispatched") {
        return UNAVAILABLE(
          `The estate is ${state}. The window opens only after the owner notice is dispatched.`
        );
      }
      if (!hasCommittedNotice(file)) {
        return UNAVAILABLE("No owner notice is committed for this estate.");
      }
      return AVAILABLE;

    case "authorize_release": {
      // authorize_release, in the ORDER the routine checks — so the reason the console shows is the
      // reason the routine would give.
      if (state === "released") return UNAVAILABLE("This estate has already been released.");
      if (state === "challenge_halted") {
        return UNAVAILABLE("The owner halted this process. Release can never proceed from a halt.");
      }
      if (state !== "challenge_window") {
        return UNAVAILABLE(`The estate is ${state}. Release proceeds only from an open window.`);
      }
      if (!hasCommittedNotice(file)) {
        return UNAVAILABLE("No owner notice is committed for this estate.");
      }
      if (!file.window.configured) {
        return UNAVAILABLE("The challenge window is not configured, so it can never elapse.");
      }
      if (!file.window.elapsed) {
        return UNAVAILABLE("The challenge window has not elapsed.");
      }
      // ★ THE TWO-PERSON RULE, TAKEN FROM THE SERVER. `viewer_is_reviewer_a` is derived inside the
      // definer from auth.uid(); this console reads it and never recomputes it from ids it was
      // handed. `authorize_release` re-checks distinctness independently regardless.
      if (file.release.viewer_is_reviewer_a) {
        return UNAVAILABLE(
          "You decided this case, so you are the first reviewer. A second operator must authorize the release."
        );
      }
      return AVAILABLE;
    }
  }
}

/**
 * ★ THE DISTINCTION THE CONSOLE MUST NEVER BLUR: "the notice was dispatched" is a fact about this
 * product's queue; "the owner was notified" is a fact about a person, and nothing here can observe
 * it. The deployed contract is dispatch INITIATION — no read receipt, no open tracking, no
 * acknowledgement. So every label below describes the QUEUE and none of them claims a person read
 * anything. The word **Delivered** appears nowhere and is asserted absent by test: mailbox delivery
 * is not something this product observes, and a label that claimed it would be the console inventing
 * the one fact the whole phase exists to stop being invented.
 *
 * ★ IT TAKES THE NOTICE, NOT THE STATUS, AND THAT SIGNATURE CHANGE IS THE POINT OF PHASE C.
 *
 * The predecessor took a bare `NoticeStatus` and answered `dispatched → "Accepted by the email
 * provider"`. That was true for every row the code could then produce and is FALSE for a pre-Phase-A
 * row: `dispatched` with a NULL `notice_accepted_at` means the acceptance stamp did not exist when
 * that row settled, so nobody knows whether the provider accepted it. Two states that need opposite
 * operator responses — one needs nothing, one needs a re-notice — were rendered with identical
 * words. A function that cannot see the acceptance fact cannot tell them apart, so it now takes the
 * row.
 *
 * ★ A RETIRED GENERATION IS LABELLED AS HISTORY FIRST. Its delivery state is still shown beside it by
 * the case screen, so nothing is lost; what must not happen is a superseded row reading with the same
 * weight as the live one, because the live one is the only one an operator can act on.
 */
export function noticeStateLabel(notice: CaseFileNotice): string {
  if (!notice.is_current) return "Historical notice generation";
  switch (notice.status) {
    case "queued":
      return "Notice queued";
    case "processing":
      return "Notice processing";
    case "dispatched":
      // ★ THE FACT DECIDES, NOT THE STATUS.
      return notice.notice_accepted_at
        ? "Provider accepted notice"
        : "Legacy acceptance fact unavailable";
    case "outcomeUncertain":
      return "Provider outcome uncertain";
    case "failedPermanent":
      return "Notice failed";
    case "cancelled":
      return "Notice cancelled";
  }
}

/**
 * The delivery state of a RETIRED generation, shown as secondary detail beside "Historical notice
 * generation" so the reason it was retired stays visible. Separate from `noticeStateLabel` because
 * the two answer different questions and merging them is how a historical row starts reading like a
 * live one.
 */
export function historicalNoticeDetail(notice: CaseFileNotice): string {
  switch (notice.status) {
    case "queued":
      return "was queued";
    case "processing":
      return "was processing";
    case "dispatched":
      return notice.notice_accepted_at ? "provider accepted" : "no acceptance fact recorded";
    case "outcomeUncertain":
      return "provider outcome uncertain";
    case "failedPermanent":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

/**
 * The estate-level dispatch summary shown beside the window controls. Deliberately a CLOSED union
 * with an explicit unknown: a type that cannot say "we do not know" invites code to invent an
 * answer, and this is the one surface where inventing one would be a claim about whether a living
 * person was warned.
 *
 * ★ PHASE 11-OC SPLITS `dispatch_initiated` IN TWO, AND THE SPLIT IS THE WHOLE POINT. It used to
 * cover every non-failed state — `queued`, `processing` and `dispatched` alike — which meant the
 * headline sentence for "we have not sent it yet" and for "the provider accepted it" was the same
 * sentence. It also had no way to say `legacy_acceptance_unavailable`, so a pre-Phase-A row read as a
 * successful dispatch. Those are three different operator situations with three different next
 * actions, and one of them needs a re-notice.
 */
export type DispatchSummary =
  | "not_dispatched"
  | "notice_queued"
  | "notice_processing"
  | "provider_accepted"
  | "legacy_acceptance_unavailable"
  | "delivery_failed"
  | "delivery_uncertain"
  | "settled_stale"
  | "notice_cancelled";

/**
 * ★ IT READS THE CURRENT GENERATION, NOT THE NEWEST ARRAY ELEMENT. `is_current` is the server's
 * answer to "which row is live" — the one nothing supersedes — and it is the row every operator
 * decision turns on. Reading `owner_notice[0]` would work today only because the projection happens
 * to order by `requested_at desc`, which is an ordering, not the invariant. Anchoring on the
 * invariant means a future ordering change cannot silently make this describe a retired generation.
 */
export function currentNotice(file: CaseFile): CaseFileNotice | undefined {
  return file.owner_notice.find((n) => n.channel === "email" && n.is_current);
}

export function dispatchSummary(file: CaseFile): DispatchSummary {
  const latest = currentNotice(file);
  if (!latest) return "not_dispatched";
  switch (latest.status) {
    case "queued":
      return "notice_queued";
    case "processing":
      return "notice_processing";
    case "dispatched":
      // ★ THE FACT, NOT THE STATUS. See `noticeStateLabel`.
      return latest.notice_accepted_at ? "provider_accepted" : "legacy_acceptance_unavailable";
    case "outcomeUncertain":
      return "delivery_uncertain";
    case "failedPermanent":
      return latest.failure_class === "stale_beyond_age_gate" ? "settled_stale" : "delivery_failed";
    case "cancelled":
      return "notice_cancelled";
  }
}

export const DISPATCH_SUMMARY_COPY: Record<DispatchSummary, string> = {
  not_dispatched: "Notice not dispatched",
  notice_queued: "Notice queued — not yet sent",
  notice_processing: "Notice processing — a worker is sending it",
  provider_accepted: "Provider accepted the notice",
  // ★ NOT "dispatched", NOT "accepted", NOT "unknown failure". This row settled before the acceptance
  // stamp existed, so what is missing is our RECORD, not necessarily the acceptance itself. The
  // sentence says exactly that and no more.
  legacy_acceptance_unavailable: "Notice marked dispatched, but no provider acceptance was recorded",
  delivery_failed: "Notice failed — it will not be retried",
  delivery_uncertain: "Provider outcome uncertain — it will not be retried",
  settled_stale: "Notice settled as stale — never sent",
  notice_cancelled: "Notice cancelled",
};

/**
 * ★ PHASE 11-OC / PHASE C — THE ONE ACTION WHOSE AVAILABILITY THIS FILE DOES NOT DECIDE.
 *
 * Every other entry in `availability` is a LOCAL MIRROR of a deployed precondition, pinned against
 * the routine's sentinels by this file's tests. That is a reasonable trade for a rule like "the case
 * must be open". It is NOT a reasonable trade here.
 *
 * Re-notice eligibility is not a status list. It turns on the lifecycle state, on whether this case
 * is still the CURRENT episode for its estate, on the acceptance FACT rather than the status — the
 * two `dispatched` rows above reach OPPOSITE verdicts — and on whether an address still resolves.
 * Mirroring that in TypeScript would be a second policy, and the first time the two drifted an
 * operator would either be offered a control the server refuses or, far worse, be denied one on an
 * estate that genuinely needs remediating.
 *
 * So the server computes it, in the SAME function `reissue_owner_safety_notice` consults, and this
 * function only renders the verdict. It grants nothing: the routine re-checks independently every
 * time. UI affordance is not permission.
 *
 * ★ THE SERVER OWNS THE RULE; THE CONSOLE OWNS THE SENTENCE. The verdict carries a named code, not
 * prose, because operator copy is a client concern and a database is a poor place to keep it.
 */
export const REISSUE_REFUSAL_COPY: Record<ReissueRefusalCode, string> = {
  case_not_found: "This case no longer exists.",
  no_verified_case: "This estate has no verified death-verification case.",
  case_not_current:
    "This is not the estate's current death process. A later case has been verified, and only that " +
    "case's notice can be re-sent.",
  invalid_reissue_state:
    "A notice can only be re-sent while the owner notice is dispatched or the challenge window is " +
    "open. Before that there is nothing to re-send; after a halt or a release the process this " +
    "notice describes is over.",
  no_current_notice:
    "No owner notice exists for this case. It needs a first dispatch, not a re-send.",
  notice_still_queued: "The current notice is still queued. The drain has not tried to send it yet.",
  notice_still_processing:
    "The current notice is being sent right now. It can be re-sent only once that attempt settles.",
  notice_already_accepted:
    "The email provider accepted the current notice, so there is nothing to remedy.",
  notice_cancelled: "The current notice was cancelled.",
  notice_not_reissuable: "The current notice is in a state this console does not yet describe.",
  owner_channel_unreachable:
    "No email address resolves for this estate's owner, so a re-sent notice could not be delivered " +
    "to anyone. Fix the owner's account first.",
};

/**
 * Availability for the re-notice control, taken verbatim from the server verdict.
 *
 * ★ IT FAILS CLOSED ON A MISSING VERDICT. An older server that does not yet project
 * `owner_notice_reissue` must produce a HIDDEN control, never an available one — a console that
 * assumed availability when the server said nothing would offer an action against a routine that may
 * not be deployed at all.
 */
export function reissueAvailability(file: CaseFile): ActionAvailability {
  const verdict = file.owner_notice_reissue;
  if (!verdict) {
    return UNAVAILABLE(
      "This server has not reported whether the notice can be re-sent, so the action is unavailable."
    );
  }
  if (verdict.eligible) return AVAILABLE;
  const code = verdict.refusal_code;
  return UNAVAILABLE(
    (code && REISSUE_REFUSAL_COPY[code]) ??
      "The server will not re-send this notice, and gave no reason this console recognises."
  );
}

/**
 * Plain-language state names. `LifecycleState` values are INTERNAL vocabulary; an operator console
 * is a production surface and internal state is not user copy. The raw value is still shown beside
 * these, because an operator reading a server error needs to match the two — that is a deliberate
 * exception for a staff surface, not a licence to leak the vocabulary into a consumer app.
 */
export const LIFECYCLE_COPY: Record<LifecycleState, string> = {
  active: "No death process",
  death_verification_pending: "Verification pending",
  death_verified: "Death verified",
  owner_notification_dispatched: "Owner notice dispatched",
  challenge_window: "Challenge window open",
  challenge_halted: "Halted by the owner",
  released: "Released",
};

/**
 * Actions that cannot be undone, flagged so the UI can require a distinct confirmation. Reviewing
 * evidence and setting a level are audited and correctable; the other four move a state machine
 * whose edges do not run backwards.
 */
export const IRREVERSIBLE: ReadonlySet<ActionId> = new Set<ActionId>([
  "decide_case",
  "dispatch_owner_notice",
  "begin_challenge_window",
  "authorize_release",
]);

/**
 * ★ WHY `reissue_owner_notice` IS NOT AN `ActionId`, AND THAT ABSENCE IS DELIBERATE.
 *
 * `ActionId` is the set of actions whose availability `availability()` decides LOCALLY. Re-notice is
 * not one of them and must never become one — its verdict comes from the server. Leaving it out of
 * the union means a future contributor cannot add a `case "reissue_owner_notice":` branch to that
 * switch without first widening the type, which is exactly the loud step that should be required.
 * A type that cannot express the mistake is better than a comment asking people not to make it.
 *
 * It is nevertheless an IRREVERSIBLE act in the sense that matters to an operator — a queued notice
 * cannot be recalled once the drain sends it — so the screen gives it the same explicit confirmation
 * step the four above get, passed directly to `LifecycleAction`.
 */
export const REISSUE_IS_CONFIRMED = true;
