/**
 * PHASE 11-K — the console's availability logic agrees with the deployed doors.
 *
 * ★ WHAT THIS FILE IS FOR, AND WHAT IT IS NOT. It proves the console SHOWS the right thing. It
 * proves nothing whatsoever about authorization — every routine gates itself, and
 * `afterworth-api/db/tests/operator_console_authorization.sql` proves that by execution against a
 * real database. If every assertion here were deleted the console would mislead operators and the
 * system would be exactly as safe.
 *
 * ★ THE FIXTURES ARE ANCHORED ON INPUT THAT THE LOGIC MUST CHANGE. A case file that already
 * satisfies the expected answer before the rule runs is not a control. Each `describe` below walks
 * the state machine so that at every step some actions flip and others do not.
 */

import { describe, expect, it } from "vitest";
import {
  availability,
  dispatchSummary,
  hasCommittedNotice,
  IRREVERSIBLE,
  levelRank,
  meetsRequirement,
  noticeDeliveryLabel
} from "../lifecycle";
import type { CaseFile, LifecycleState, NoticeStatus, VerificationLevel } from "../types";

const REVIEWER_A = "11111111-1111-4111-8111-111111111111";

function makeFile(over: {
  state?: LifecycleState;
  status?: CaseFile["case"]["status"];
  attained?: VerificationLevel | null;
  required?: VerificationLevel;
  noticeStatus?: NoticeStatus | null;
  noticeFailure?: string | null;
  elapsed?: boolean;
  configured?: boolean;
  viewerIsReviewerA?: boolean;
  decided?: boolean;
} = {}): CaseFile {
  const state = over.state ?? "death_verification_pending";
  const noticeStatus = over.noticeStatus === undefined ? null : over.noticeStatus;
  return {
    case: {
      case_id: "c1",
      estate_id: "e1",
      estate_name: "Test Estate",
      status: over.status ?? "open",
      event_type: "death",
      initiated_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      initiator_capacity: "executor",
      jurisdiction_context: "US-CA",
      required_level_at_initiation: over.required ?? "attestation",
      required_level_live: over.required ?? "attestation",
      attained_level: over.attained === undefined ? null : over.attained,
      decided_at: over.decided ? "2026-08-02T00:00:00Z" : null,
      decision_note: null
    },
    initiator: { user_id: "u1", email: null, name: "Dana Fiduciary", capacity: "executor" },
    lifecycle: {
      state,
      owner_notified_at: null,
      challenge_window_started_at: null,
      halted_at: state === "challenge_halted" ? "2026-08-05T00:00:00Z" : null,
      released_at: null,
      updated_at: null
    },
    window: {
      duration: "7 days",
      configured: over.configured ?? true,
      release_eligible_at: "2026-08-10T00:00:00Z",
      elapsed: over.elapsed ?? false
    },
    owner_notice: noticeStatus
      ? [{
          id: "n1",
          channel: "email",
          notice_kind: "death_process.window_opened",
          status: noticeStatus,
          requested_at: "2026-08-03T00:00:00Z",
          dispatched_at: null,
          attempts: 1,
          failure_class: over.noticeFailure ?? null
        }]
      : [],
    evidence: [],
    release: {
      reviewer_a: over.decided ? REVIEWER_A : null,
      viewer_is_reviewer_a: over.viewerIsReviewerA ?? false,
      authorized: null
    }
  };
}

describe("the verification ladder", () => {
  it("ranks in declaration order, matching the Postgres enum", () => {
    expect(levelRank("none")).toBeLessThan(levelRank("attestation"));
    expect(levelRank("attestation")).toBeLessThan(levelRank("documentary"));
    expect(levelRank("documentary")).toBeLessThan(levelRank("enhanced_kyc"));
  });

  it("ranks null and unknown LOWEST — fail closed, never fail open", () => {
    expect(levelRank(null)).toBe(-1);
    expect(levelRank("not_a_level" as VerificationLevel)).toBe(-1);
  });

  it("a null attained level never satisfies a requirement", () => {
    // Mirrors the routine's coalesce(attained >= required, false).
    expect(meetsRequirement(makeFile({ attained: null, required: "attestation" }))).toBe(false);
  });

  it("compares against the LIVE requirement, not the initiation snapshot", () => {
    const file = makeFile({ attained: "attestation" });
    file.case.required_level_at_initiation = "attestation"; // would have passed
    file.case.required_level_live = "enhanced_kyc"; // tightened mid-case
    // If this read the snapshot it would answer true and the console would offer a verify the
    // routine refuses.
    expect(meetsRequirement(file)).toBe(false);
  });

  it("is satisfied when attained meets or exceeds the live bar", () => {
    expect(meetsRequirement(makeFile({ attained: "attestation", required: "attestation" }))).toBe(true);
    expect(meetsRequirement(makeFile({ attained: "enhanced_kyc", required: "documentary" }))).toBe(true);
  });
});

describe("dispatch is initiation, never delivery", () => {
  it("a QUEUED notice already satisfies the door's predicate", () => {
    // begin_challenge_window requires `status <> 'cancelled'`, NOT `= 'dispatched'`. If the console
    // required delivery it would hide a window the server would open.
    expect(hasCommittedNotice(makeFile({ noticeStatus: "queued" }))).toBe(true);
  });

  it("a CANCELLED notice does not", () => {
    expect(hasCommittedNotice(makeFile({ noticeStatus: "cancelled" }))).toBe(false);
  });

  it("no notice at all does not", () => {
    expect(hasCommittedNotice(makeFile({ noticeStatus: null }))).toBe(false);
  });

  it("no delivery label claims a person read anything", () => {
    const statuses: NoticeStatus[] = [
      "queued", "processing", "dispatched", "outcomeUncertain", "failedPermanent", "cancelled"
    ];
    for (const s of statuses) {
      const label = noticeDeliveryLabel(s).toLowerCase();
      expect(label).not.toContain("notified");
      expect(label).not.toContain("received");
      expect(label).not.toContain("read");
      expect(label).not.toContain("opened");
      expect(label).not.toContain("delivered");
    }
  });

  it("distinguishes a stale settlement from an ordinary failure", () => {
    // These are operationally different: one means the queue fell behind past the age gate and the
    // notice was deliberately never sent; the other means a provider refused it.
    expect(dispatchSummary(makeFile({
      noticeStatus: "failedPermanent", noticeFailure: "stale_beyond_age_gate"
    }))).toBe("settled_stale");
    expect(dispatchSummary(makeFile({
      noticeStatus: "failedPermanent", noticeFailure: "invalid_recipient"
    }))).toBe("delivery_failed");
  });

  it("reports an uncertain outcome as uncertain rather than rounding it", () => {
    expect(dispatchSummary(makeFile({ noticeStatus: "outcomeUncertain" }))).toBe("delivery_uncertain");
  });

  it("reports no notice as not dispatched", () => {
    expect(dispatchSummary(makeFile({ noticeStatus: null }))).toBe("not_dispatched");
  });
});

describe("dispatch availability follows the deployed state machine", () => {
  it("is available ONLY from death_verified", () => {
    expect(availability("dispatch_owner_notice", makeFile({ state: "death_verified" })).available).toBe(true);
    for (const s of [
      "active", "death_verification_pending", "challenge_window", "challenge_halted", "released"
    ] as LifecycleState[]) {
      expect(availability("dispatch_owner_notice", makeFile({ state: s })).available).toBe(false);
    }
  });

  it("says the notice is already dispatched rather than giving a generic refusal", () => {
    const a = availability("dispatch_owner_notice", makeFile({ state: "owner_notification_dispatched" }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("already been dispatched");
  });
});

describe("the window opens only on a notified owner", () => {
  it("is unavailable from death_verified — the un-notified edge was deleted in 11-F", () => {
    const a = availability("begin_challenge_window", makeFile({ state: "death_verified" }));
    expect(a.available).toBe(false);
  });

  it("is available from owner_notification_dispatched with a committed notice", () => {
    expect(availability("begin_challenge_window", makeFile({
      state: "owner_notification_dispatched", noticeStatus: "queued"
    })).available).toBe(true);
  });

  it("is unavailable when the only notice was cancelled", () => {
    const a = availability("begin_challenge_window", makeFile({
      state: "owner_notification_dispatched", noticeStatus: "cancelled"
    }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("No owner notice is committed");
  });
});

describe("release, in the routine's own precondition order", () => {
  const base = {
    state: "challenge_window" as LifecycleState,
    status: "verified" as CaseFile["case"]["status"],
    noticeStatus: "dispatched" as NoticeStatus,
    decided: true,
    elapsed: true
  };

  it("is available for a second reviewer once the window has elapsed", () => {
    expect(availability("authorize_release", makeFile({ ...base })).available).toBe(true);
  });

  it("REFUSES the first reviewer, and says why in the two-person language", () => {
    const a = availability("authorize_release", makeFile({ ...base, viewerIsReviewerA: true }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("second operator");
  });

  it("refuses before the window has elapsed", () => {
    const a = availability("authorize_release", makeFile({ ...base, elapsed: false }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("not elapsed");
  });

  it("refuses when the window is unconfigured, and says it can never elapse", () => {
    const a = availability("authorize_release", makeFile({ ...base, configured: false, elapsed: false }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("never elapse");
  });

  it("refuses from a halt, permanently and in those words", () => {
    const a = availability("authorize_release", makeFile({ ...base, state: "challenge_halted" }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("halted");
    expect(a.reason).toContain("never");
  });

  it("refuses when already released", () => {
    expect(availability("authorize_release", makeFile({ ...base, state: "released" })).available).toBe(false);
  });

  it("refuses without a committed notice even inside an open window", () => {
    const a = availability("authorize_release", makeFile({ ...base, noticeStatus: "cancelled" }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("No owner notice is committed");
  });

  /**
   * ★ THE ORDER ITSELF IS THE ASSERTION. `authorize_release` checks state, then dispatch facts,
   * then the window, then the two-person rule. A console that checked the two-person rule FIRST
   * would tell a halted case's first reviewer they were ineligible — true but irrelevant — and
   * hide the fact that the process is over.
   */
  it("reports the halt rather than the reviewer when both apply", () => {
    const a = availability("authorize_release", makeFile({
      ...base, state: "challenge_halted", viewerIsReviewerA: true
    }));
    expect(a.reason).toContain("halted");
    expect(a.reason).not.toContain("second operator");
  });
});

describe("decisions on a closed case", () => {
  for (const status of ["verified", "rejected", "cancelled", "halted"] as const) {
    it(`refuses to re-decide a ${status} case`, () => {
      expect(availability("decide_case", makeFile({ status })).available).toBe(false);
    });
    it(`refuses to set a level on a ${status} case`, () => {
      expect(availability("set_attained_level", makeFile({ status })).available).toBe(false);
    });
  }

  it("permits both while the case is open", () => {
    expect(availability("decide_case", makeFile({ status: "open" })).available).toBe(true);
    expect(availability("set_attained_level", makeFile({ status: "open" })).available).toBe(true);
  });
});

describe("irreversibility is declared", () => {
  it("names the four acts that move a machine whose edges do not run backwards", () => {
    expect([...IRREVERSIBLE].sort()).toEqual(
      ["authorize_release", "begin_challenge_window", "decide_case", "dispatch_owner_notice"]
    );
  });

  it("does not mark the two audited, correctable acts as irreversible", () => {
    expect(IRREVERSIBLE.has("review_evidence")).toBe(false);
    expect(IRREVERSIBLE.has("set_attained_level")).toBe(false);
  });
});

describe("every unavailable answer explains itself", () => {
  it("never returns an unavailable action without a reason", () => {
    const files = [
      makeFile({ state: "active" }),
      makeFile({ state: "death_verified", status: "verified" }),
      makeFile({ state: "challenge_halted", status: "halted" }),
      makeFile({ state: "released", status: "verified" })
    ];
    const actions = [
      "review_evidence", "set_attained_level", "decide_case",
      "dispatch_owner_notice", "begin_challenge_window", "authorize_release"
    ] as const;
    let unavailableSeen = 0;
    for (const f of files) {
      for (const a of actions) {
        const r = availability(a, f);
        if (!r.available) {
          unavailableSeen++;
          expect(r.reason, `${a} gave no reason`).toBeTruthy();
        }
      }
    }
    // POSITIVE CONTROL: the loop must actually have seen unavailable actions, or it asserted
    // nothing at all.
    expect(unavailableSeen).toBeGreaterThan(10);
  });

  it("describes the lifecycle, never the operator's permissions", () => {
    const files = [makeFile({ state: "active" }), makeFile({ state: "released" })];
    for (const f of files) {
      for (const a of ["dispatch_owner_notice", "begin_challenge_window", "authorize_release"] as const) {
        const r = availability(a, f);
        if (!r.available) {
          const reason = r.reason!.toLowerCase();
          expect(reason).not.toContain("not allowed");
          expect(reason).not.toContain("permission");
          expect(reason).not.toContain("forbidden");
          expect(reason).not.toContain("unauthorized");
        }
      }
    }
  });
});
