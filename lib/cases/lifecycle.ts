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

import type { CaseFile, LifecycleState, NoticeStatus, VerificationLevel } from "./types";
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
 * anything.
 */
export function noticeDeliveryLabel(status: NoticeStatus): string {
  switch (status) {
    case "queued":
      return "Dispatch initiated — not yet sent";
    case "processing":
      return "Dispatch initiated — sending";
    case "dispatched":
      return "Accepted by the email provider";
    case "outcomeUncertain":
      return "Delivery outcome unknown — not retried";
    case "failedPermanent":
      return "Delivery failed — will not be retried";
    case "cancelled":
      return "Cancelled";
  }
}

/**
 * The estate-level dispatch summary shown beside the window controls. Deliberately a CLOSED union
 * with an explicit unknown: a type that cannot say "we do not know" invites code to invent an
 * answer, and this is the one surface where inventing one would be a claim about whether a living
 * person was warned.
 */
export type DispatchSummary =
  | "not_dispatched"
  | "dispatch_initiated"
  | "delivery_failed"
  | "delivery_uncertain"
  | "settled_stale";

export function dispatchSummary(file: CaseFile): DispatchSummary {
  const email = file.owner_notice.filter((n) => n.channel === "email" && n.status !== "cancelled");
  // Newest first, as the projection orders them. Read defensively rather than by index-and-assert:
  // an empty array and a sparse one both mean "no notice to describe", and a summary that assumed
  // otherwise would throw on the one screen an operator opens when something has gone wrong.
  const latest = email[0];
  if (!latest) return "not_dispatched";
  if (latest.status === "outcomeUncertain") return "delivery_uncertain";
  if (latest.status === "failedPermanent") {
    return latest.failure_class === "stale_beyond_age_gate" ? "settled_stale" : "delivery_failed";
  }
  return "dispatch_initiated";
}

export const DISPATCH_SUMMARY_COPY: Record<DispatchSummary, string> = {
  not_dispatched: "Notice not dispatched",
  dispatch_initiated: "Notice dispatch initiated",
  delivery_failed: "Notice delivery failed",
  delivery_uncertain: "Notice delivery outcome unknown",
  settled_stale: "Notice settled as stale — never sent",
};

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
