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
  currentNotice,
  DISPATCH_SUMMARY_COPY,
  dispatchSummary,
  hasCommittedNotice,
  historicalNoticeDetail,
  IRREVERSIBLE,
  levelRank,
  meetsRequirement,
  noticeStateLabel,
  REISSUE_REFUSAL_COPY,
  reissueAvailability
} from "../lifecycle";
import type {
  CaseFile,
  CaseFileNotice,
  LifecycleState,
  NoticeStatus,
  ReissueRefusalCode,
  ReissueVerdict,
  ReleaseAuthority,
  VerificationLevel
} from "../types";

const REVIEWER_A = "11111111-1111-4111-8111-111111111111";

function makeNotice(over: Partial<CaseFileNotice> = {}): CaseFileNotice {
  return {
    id: "n1",
    channel: "email",
    notice_kind: "death_process.window_opened",
    status: "queued",
    requested_at: "2026-08-03T00:00:00Z",
    dispatched_at: null,
    attempts: 1,
    failure_class: null,
    case_id: "c1",
    generation: 1,
    superseded_by: null,
    is_current: true,
    notice_accepted_at: null,
    claimed_at: null,
    ...over
  };
}

/**
 * The server's verdict, defaulted to a refusal. Fail-closed in the FIXTURE too: a default of
 * `eligible: true` would make every "the control is hidden" assertion below pass for the wrong
 * reason, and a test fixture that leans the unsafe way is how a real default gets one.
 */
const NOT_ELIGIBLE: ReissueVerdict = {
  eligible: false,
  refusal_code: "no_current_notice",
  case_is_current: true,
  lifecycle_state: "challenge_window",
  owner_channel_resolvable: true,
  prior_notice_id: null,
  prior_generation: null,
  prior_status: null,
  prior_notice_kind: null,
  prior_failure_class: null,
  prior_accepted: false,
  next_generation: null,
  reissue_reason: null
};

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
  noticeAccepted?: boolean;
  notices?: CaseFileNotice[];
  reissue?: Partial<ReissueVerdict>;
  /**
   * ★ PHASE 11-OC / PHASE D. The server's release verdict. `undefined` deliberately means "this
   * server did not project it" — the pre-Phase-D shape — so the fail-closed branch has a fixture.
   */
  authority?: Partial<ReleaseAuthority> | null;
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
    owner_notice:
      over.notices ??
      (noticeStatus
        ? [makeNotice({
            status: noticeStatus,
            failure_class: over.noticeFailure ?? null,
            notice_accepted_at: over.noticeAccepted ? "2026-08-03T00:01:00Z" : null
          })]
        : []),
    owner_notice_reissue: { ...NOT_ELIGIBLE, ...(over.reissue ?? {}) },
    /**
     * ★ PHASE D — DEFAULTS DERIVED FROM THE SAME INPUTS THE SERVER WOULD USE, so a fixture cannot
     * describe a state the server could never produce (elapsed=true with no acceptance fact, say).
     * `authority: null` models a pre-Phase-D server that projects nothing at all.
     */
    release_authority:
      over.authority === null
        ? undefined
        : {
            ready:
              state === "challenge_window" &&
              (over.configured ?? true) &&
              (over.elapsed ?? false) &&
              (over.noticeAccepted ?? true),
            refusal_code: !(over.noticeAccepted ?? true)
              ? "notice_never_accepted"
              : state !== "challenge_window"
                ? "invalid_release_state"
                : !(over.configured ?? true)
                  ? "release_window_not_configured"
                  : !(over.elapsed ?? false)
                    ? "release_window_not_elapsed"
                    : null,
            case_id: "c1",
            case_is_current: true,
            lifecycle_state: state,
            notice_id: "n1",
            generation: 1,
            notice_kind: "death_process.window_opened",
            notice_accepted_at: (over.noticeAccepted ?? true) ? "2026-08-03T00:01:00Z" : null,
            accepted: over.noticeAccepted ?? true,
            window_duration: "7 days",
            window_configured: over.configured ?? true,
            release_eligible_at: (over.noticeAccepted ?? true) ? "2026-08-10T00:00:00Z" : null,
            elapsed: over.elapsed ?? false,
            ...(over.authority ?? {})
          },
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

  it("no notice label claims a person read anything, on any status or acceptance combination", () => {
    const statuses: NoticeStatus[] = [
      "queued", "processing", "dispatched", "outcomeUncertain", "failedPermanent", "cancelled"
    ];
    let seen = 0;
    for (const s of statuses) {
      for (const accepted of [null, "2026-08-03T00:01:00Z"]) {
        for (const current of [true, false]) {
          const label = noticeStateLabel(
            makeNotice({ status: s, notice_accepted_at: accepted, is_current: current })
          ).toLowerCase();
          seen++;
          expect(label).not.toContain("notified");
          expect(label).not.toContain("received");
          expect(label).not.toContain("read");
          expect(label).not.toContain("opened");
          // ★ THE WORD THIS CONSOLE MAY NEVER SAY. Mailbox delivery is not established by anything
          // this product can observe, and no combination of status and acceptance makes it true.
          expect(label).not.toContain("delivered");
        }
      }
    }
    // POSITIVE CONTROL: the loop must actually have produced labels.
    expect(seen).toBe(24);
  });

  it("never says `delivered` anywhere in the estate-level summary copy either", () => {
    for (const copy of Object.values(DISPATCH_SUMMARY_COPY)) {
      expect(copy.toLowerCase()).not.toContain("delivered");
      expect(copy.toLowerCase()).not.toContain("notified");
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

  it("refuses before the window has elapsed, and says what the clock runs from", () => {
    const a = availability("authorize_release", makeFile({ ...base, elapsed: false }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("not elapsed");
    /**
     * ★ PHASE D — THE SENTENCE MUST NAME THE ANCHOR. "The window has not elapsed" was true before
     * and after the cutover, so a test that only checked those words could not tell an operator
     * (or a reviewer) that the clock had moved. It now runs from provider acceptance, and an
     * operator staring at a dispatch timestamp seven days old needs to be told why that is not the
     * relevant date.
     */
    expect(a.reason).toContain("provider accepted");
  });

  it("refuses when the window is unconfigured, and says it can never elapse", () => {
    const a = availability("authorize_release", makeFile({ ...base, configured: false, elapsed: false }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("never elapse");
  });

  /**
   * ★ THE PHASE D CLASS, AND THE ONE THE OLD CONSOLE GOT WRONG. A notice marked `dispatched` whose
   * provider acceptance was never recorded used to be indistinguishable from a successful one, so
   * the console said "the window has not elapsed" — a statement about the clock that quietly
   * conceded the notice qualified. It never did.
   */
  it("refuses a legacy dispatched notice with no acceptance fact, and names the remedy", () => {
    const a = availability("authorize_release", makeFile({ ...base, noticeAccepted: false }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("has not accepted");
    expect(a.reason).toContain("Re-send");
    // ★ AND IT MUST NOT CLAIM DELIVERY. What is missing is the provider's acceptance, not proof
    // that a mailbox never received anything — this product cannot observe the latter at all.
    expect(a.reason).not.toMatch(/deliver/i);
  });

  /**
   * ★ FAIL CLOSED WHEN THE SERVER SAYS NOTHING. A console talking to a pre-Phase-D server must not
   * fall back to the local mirror it used to keep: that would judge an IRREVERSIBLE action by a
   * rule the deployed routine may no longer apply.
   */
  it("refuses when the server projects no release authority at all", () => {
    const a = availability("authorize_release", makeFile({ ...base, authority: null }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("has not reported");
  });

  /**
   * ★ THE SERVER IS THE AUTHORITY, EVEN WHEN THE CONSOLE COULD GUESS OTHERWISE. This fixture looks
   * releasable by every local signal — window elapsed, notice accepted, configured — and the server
   * says no. The console must obey the server, or it is keeping a second policy after all.
   */
  it("obeys a server refusal even when every local signal looks releasable", () => {
    const a = availability("authorize_release", makeFile({
      ...base,
      authority: { ready: false, refusal_code: "notice_episode_mismatch" }
    }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("current death process");
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

  /**
   * ★ RETARGETED BY PHASE D. A cancelled notice used to trip the console's own committed-notice
   * mirror. That mirror is gone from this branch: the server decides, and a cancelled notice has no
   * acceptance fact, so the refusal now arrives as `notice_never_accepted` — the same answer the
   * door gives, for the same reason, rather than a locally reconstructed one.
   */
  it("refuses a cancelled notice, with the SERVER's reason rather than a local mirror", () => {
    const a = availability("authorize_release", makeFile({
      ...base, noticeStatus: "cancelled", noticeAccepted: false
    }));
    expect(a.available).toBe(false);
    expect(a.reason).toContain("has not accepted");
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE 11-OC / PHASE C — the operator re-notice
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("a notice label reports the FACT, never the status alone", () => {
  /**
   * ★ THE PAIR THAT MAKES THIS REAL. Both rows are `dispatched`. The ONLY difference is whether a
   * provider acceptance was ever recorded, and they must reach opposite labels — otherwise the rule
   * is a status list wearing a timestamp's clothes, which is exactly the defect Phase 11-OC exists
   * to remove from the release door and which the console would then reintroduce on screen.
   */
  it("distinguishes an accepted dispatch from a legacy one with no acceptance record", () => {
    const accepted = makeNotice({ status: "dispatched", notice_accepted_at: "2026-08-03T00:01:00Z" });
    const legacy = makeNotice({ status: "dispatched", notice_accepted_at: null });

    expect(noticeStateLabel(accepted)).toBe("Provider accepted notice");
    expect(noticeStateLabel(legacy)).toBe("Legacy acceptance fact unavailable");
    expect(noticeStateLabel(accepted)).not.toBe(noticeStateLabel(legacy));
  });

  it("uses the exact operator vocabulary for every current-generation state", () => {
    expect(noticeStateLabel(makeNotice({ status: "queued" }))).toBe("Notice queued");
    expect(noticeStateLabel(makeNotice({ status: "processing" }))).toBe("Notice processing");
    expect(noticeStateLabel(makeNotice({ status: "outcomeUncertain" }))).toBe(
      "Provider outcome uncertain"
    );
    expect(noticeStateLabel(makeNotice({ status: "failedPermanent" }))).toBe("Notice failed");
  });

  it("labels a RETIRED generation as history, whatever its delivery state was", () => {
    for (const status of [
      "queued", "processing", "dispatched", "outcomeUncertain", "failedPermanent", "cancelled"
    ] as NoticeStatus[]) {
      expect(noticeStateLabel(makeNotice({ status, is_current: false })))
        .toBe("Historical notice generation");
    }
  });

  it("keeps the retired generation's delivery state visible as secondary detail", () => {
    // Losing it would leave an episode that looks re-noticed for no reason — and that evidence is
    // precisely why the reissue was warranted.
    expect(historicalNoticeDetail(makeNotice({ status: "failedPermanent", is_current: false })))
      .toContain("failed");
    expect(historicalNoticeDetail(
      makeNotice({ status: "dispatched", is_current: false, notice_accepted_at: null })
    )).toContain("no acceptance fact");
    expect(historicalNoticeDetail(
      makeNotice({ status: "dispatched", is_current: false, notice_accepted_at: "2026-08-03T00:01:00Z" })
    )).toContain("provider accepted");
  });
});

describe("the estate summary reads the CURRENT generation, not the newest array element", () => {
  /**
   * ★ ANCHORED ON INPUT THE RULE MUST CHANGE. The array is deliberately ordered with the RETIRED
   * generation first, so a summary that read `owner_notice[0]` would describe the dead row. Ordering
   * is not the invariant; `is_current` is.
   */
  const retiredFirst = [
    makeNotice({ id: "n1", generation: 1, is_current: false, superseded_by: "n2", status: "failedPermanent" }),
    makeNotice({ id: "n2", generation: 2, is_current: true, status: "queued",
                 notice_kind: "death_process.window_renotice" })
  ];

  it("picks the live generation even when a retired one comes first", () => {
    const file = makeFile({ notices: retiredFirst });
    expect(currentNotice(file)?.id).toBe("n2");
    expect(dispatchSummary(file)).toBe("notice_queued");
  });

  it("does not report a re-noticed estate as accepted merely because a generation was queued", () => {
    // The whole D7 monotonicity property, on screen: queueing a warning adds no release authority,
    // and the console must not imply otherwise.
    expect(DISPATCH_SUMMARY_COPY[dispatchSummary(makeFile({ notices: retiredFirst }))])
      .not.toMatch(/accepted/i);
  });

  it("separates a legacy dispatched summary from an accepted one", () => {
    expect(dispatchSummary(makeFile({ noticeStatus: "dispatched", noticeAccepted: false })))
      .toBe("legacy_acceptance_unavailable");
    expect(dispatchSummary(makeFile({ noticeStatus: "dispatched", noticeAccepted: true })))
      .toBe("provider_accepted");
  });
});

describe("re-notice availability is the SERVER's answer, never this file's", () => {
  it("is available exactly when the verdict says eligible", () => {
    expect(reissueAvailability(makeFile({ reissue: { eligible: true, refusal_code: null } })).available)
      .toBe(true);
    expect(reissueAvailability(makeFile({ reissue: { eligible: false, refusal_code: "notice_still_queued" } })).available)
      .toBe(false);
  });

  /**
   * ★ THE CONSOLE DOES NOT SECOND-GUESS THE SERVER IN EITHER DIRECTION. Two files that "obviously"
   * should not be eligible — an accepted notice, and a case that is no longer current — are handed to
   * this function with `eligible: true`. It must still say available, because the server is the
   * authority and a client that overrode it would be a second policy with no test in front of it.
   */
  it("does not override an ELIGIBLE verdict, even on a case the console would have refused", () => {
    const accepted = makeFile({
      noticeStatus: "dispatched",
      noticeAccepted: true,
      reissue: { eligible: true, refusal_code: null }
    });
    expect(reissueAvailability(accepted).available).toBe(true);

    const stale = makeFile({
      state: "released",
      reissue: { eligible: true, refusal_code: null, case_is_current: false }
    });
    expect(reissueAvailability(stale).available).toBe(true);
  });

  it("fails CLOSED when the server projected no verdict at all", () => {
    // An older API that does not yet carry `owner_notice_reissue` must produce a hidden control,
    // never an available one — the routine may not even be deployed.
    const file = makeFile();
    delete (file as { owner_notice_reissue?: unknown }).owner_notice_reissue;
    const a = reissueAvailability(file);
    expect(a.available).toBe(false);
    expect(a.reason).toBeTruthy();
  });

  it("explains every refusal code the server can return", () => {
    const CODES: ReissueRefusalCode[] = [
      "case_not_found", "no_verified_case", "case_not_current", "invalid_reissue_state",
      "no_current_notice", "notice_still_queued", "notice_still_processing",
      "notice_already_accepted", "notice_cancelled", "notice_not_reissuable",
      "owner_channel_unreachable"
    ];
    for (const code of CODES) {
      const a = reissueAvailability(makeFile({ reissue: { eligible: false, refusal_code: code } }));
      expect(a.available).toBe(false);
      expect(a.reason, `${code} has no operator copy`).toBeTruthy();
      // Describes the LIFECYCLE or the queue, never the operator's permissions.
      const reason = a.reason!.toLowerCase();
      expect(reason).not.toContain("not allowed");
      expect(reason).not.toContain("permission");
      expect(reason).not.toContain("unauthorized");
    }
    // The copy map covers the union exactly — no orphan entry, no missing one.
    expect(Object.keys(REISSUE_REFUSAL_COPY).sort()).toEqual([...CODES].sort());
  });

  it("degrades to a refusal, never to availability, on an unrecognised code", () => {
    const a = reissueAvailability(
      makeFile({ reissue: { eligible: false, refusal_code: "brand_new_code" as ReissueRefusalCode } })
    );
    expect(a.available).toBe(false);
    expect(a.reason).toBeTruthy();
  });

  /**
   * ★ THE STRUCTURAL GUARANTEE THAT THERE IS NO LOCAL MIRROR. `availability()` decides the six
   * actions whose preconditions this file legitimately duplicates. Re-notice is not one of them and
   * must never become one: adding a `case "reissue_owner_notice"` branch would require widening
   * `ActionId` first, which is the loud step. This asserts the union has not been widened.
   */
  it("keeps re-notice out of the locally-decided ActionId set", () => {
    const locallyDecided = [
      "review_evidence", "set_attained_level", "decide_case",
      "dispatch_owner_notice", "begin_challenge_window", "authorize_release"
    ];
    for (const id of locallyDecided) {
      expect(availability(id as Parameters<typeof availability>[0], makeFile())).toBeTruthy();
    }
    // IRREVERSIBLE is typed on ActionId, so a re-notice entry could only exist if the union grew.
    expect([...IRREVERSIBLE]).not.toContain("reissue_owner_notice");
  });
});
