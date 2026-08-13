"use client";
/**
 * THE CASE FILE — the one screen from which the lifecycle is driven.
 *
 * ★ IT IS ORGANISED AROUND THE LIFECYCLE, NOT AROUND TABLES. Evidence → verification decision →
 * owner notice → challenge window → release, in that order, because that is the order the state
 * machine permits and an operator reading top to bottom should be reading forwards in time.
 *
 * ★ IT NEVER CLAIMS SOMEONE WAS NOTIFIED. The server contract is dispatch INITIATION — a committed
 * row addressed to a resolved address — and nothing in this product can observe a person reading an
 * email. Every string in the notice section describes the QUEUE. `begin_challenge_window` opens on
 * a `queued` row, so the window can legitimately be open while delivery is still pending, and the
 * screen says exactly that rather than smoothing it into "the owner was told".
 *
 * ★ THE CHALLENGE WINDOW IS SHOWN AS FACTS, NOT AS A COUNTDOWN. A progress bar filling toward
 * release would be this console performing urgency at the expense of the person the window exists
 * to protect. The operator gets the eligibility instant and whether it has passed; nothing counts
 * down, nothing turns amber, nothing encourages.
 *
 * ★ AND NO CONTROL HERE IS A PERMISSION. Every call is re-gated inside its routine. This screen
 * decides what to display.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  authorizeRelease,
  beginChallengeWindow,
  decideCase,
  dispatchOwnerNotice,
  getCase,
  reviewEvidence,
  setAttainedLevel
} from "@/lib/cases/rpc";
import {
  availability,
  DISPATCH_SUMMARY_COPY,
  dispatchSummary,
  LIFECYCLE_COPY,
  meetsRequirement,
  noticeDeliveryLabel
} from "@/lib/cases/lifecycle";
import { VERIFICATION_LEVELS, type CaseFile, type VerificationLevel } from "@/lib/cases/types";
import { humanizeError } from "@/lib/errors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LifecycleAction } from "@/components/cases/LifecycleAction";

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default function CaseDetailPage({ params }: { params: { id: string } }) {
  const caseId = params.id;
  const [file, setFile] = useState<CaseFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [level, setLevel] = useState<VerificationLevel>("attestation");
  const [basis, setBasis] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [releaseReason, setReleaseReason] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      setFile(await getCase(caseId));
    } catch (e) {
      setError(humanizeError(e));
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Every action refetches the case afterwards rather than patching local state. The server is the
   * authority on what the lifecycle now is, and a console that inferred the new state would be a
   * second state machine — the exact duplication Phase 11 spent five sub-phases removing.
   */
  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(success);
      await load();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(null);
    }
  }

  if (error && !file) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold" aria-level={1}>Case</h1>
        <Card className="border-destructive p-4" role="alert">
          <p className="text-sm">{error}</p>
        </Card>
        <Link href="/cases" className="text-sm underline underline-offset-2">Back to all cases</Link>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold" aria-level={1}>Case</h1>
        <p className="text-sm text-muted-foreground" role="status">Loading case…</p>
      </div>
    );
  }

  const c = file.case;
  const summary = dispatchSummary(file);
  const sufficient = meetsRequirement(file);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/cases" className="text-sm underline underline-offset-2">Back to all cases</Link>
        {/* The ONE level-1 landmark. Every section heading below is level 2. */}
        <h1 className="mt-2 text-2xl font-semibold" aria-level={1}>
          {c.estate_name ?? "Unnamed estate"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Case {c.case_id} · opened {fmt(c.initiated_at)}
        </p>
      </div>

      {error && (
        <Card className="border-destructive p-4" role="alert">
          <p className="text-sm">{error}</p>
        </Card>
      )}
      {notice && (
        <Card className="p-4" role="status">
          <p className="text-sm">{notice}</p>
        </Card>
      )}

      {/* ── STATUS ─────────────────────────────────────────────────────────────────────────── */}
      <Card className="p-4">
        <h2 className="font-medium">Status</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Case</dt>
            <dd><Badge>{c.status}</Badge></dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Estate lifecycle</dt>
            <dd>
              {LIFECYCLE_COPY[file.lifecycle.state]}{" "}
              <span className="text-muted-foreground">({file.lifecycle.state})</span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Initiated by</dt>
            <dd>
              {file.initiator.name ?? file.initiator.email ?? file.initiator.user_id}
              {file.initiator.capacity ? ` · ${file.initiator.capacity}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Jurisdiction on the case</dt>
            <dd>{c.jurisdiction_context ?? "Not recorded"}</dd>
          </div>
        </dl>
      </Card>

      {/* ── VERIFICATION LEVEL ─────────────────────────────────────────────────────────────── */}
      <Card className="p-4">
        <h2 className="font-medium">Verification level</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Required now</dt>
            <dd className="font-medium">{c.required_level_live}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Required when opened</dt>
            <dd>{c.required_level_at_initiation}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Attained</dt>
            <dd>{c.attained_level ?? "None attained"}</dd>
          </div>
        </dl>
        {c.required_level_live !== c.required_level_at_initiation && (
          <p className="mt-3 text-sm">
            Policy changed after this case was opened. The requirement applied at decision time is{" "}
            <strong>{c.required_level_live}</strong>.
          </p>
        )}
        {/*
          A statement of fact about two recorded values — NOT a confidence score, a percentage, or a
          recommendation. The console never suggests what the operator should conclude.
        */}
        <p className="mt-3 text-sm">
          {sufficient
            ? "The attained level meets the current requirement."
            : "The attained level does not meet the current requirement, so verifying will be refused."}
        </p>

        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-medium">Set the attained level</h3>
          <p className="text-sm text-muted-foreground">
            Records what the review process established. This is a separate act from reviewing
            evidence, and it does not verify the case.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="level" className="block text-sm">Level</label>
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value as VerificationLevel)}
                className="mt-1 rounded border px-2 py-1.5 text-sm"
              >
                {VERIFICATION_LEVELS.filter((l) => l !== "none").map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[16rem] flex-1">
              <label htmlFor="basis" className="block text-sm">Basis</label>
              <input
                id="basis"
                value={basis}
                onChange={(e) => setBasis(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                placeholder="What established this level"
              />
            </div>
            <LifecycleAction
              label="Set attained level"
              availability={availability("set_attained_level", file)}
              busy={busy === "level"}
              onConfirm={() =>
                run("level", () => setAttainedLevel(caseId, level, basis.trim() || null),
                    "Attained level recorded.")
              }
            />
          </div>
        </div>
      </Card>

      {/* ── EVIDENCE ───────────────────────────────────────────────────────────────────────── */}
      <Card className="p-4">
        <h2 className="font-medium">Evidence</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reviewing an item records what a reviewer concluded about it. It moves no verification
          level and verifies nothing.
        </p>
        {file.evidence.length === 0 ? (
          <p className="mt-3 text-sm">No evidence has been attached to this case.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {file.evidence.map((e) => (
              <li key={e.evidence_id} className="rounded border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{e.title ?? "Untitled document"}</span>
                  <Badge>{e.review_status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {e.doc_type ?? "unknown type"} · submitted {fmt(e.submitted_at)}
                </p>
                {e.review_note && <p className="mt-2 text-sm">Note: {e.review_note}</p>}
                {e.review_status === "received" && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy === e.evidence_id}
                      onClick={() =>
                        run(e.evidence_id,
                            () => reviewEvidence(e.evidence_id, "reviewed_accepted", null),
                            "Evidence recorded as accepted.")
                      }
                    >
                      Record as accepted
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy === e.evidence_id}
                      onClick={() =>
                        run(e.evidence_id,
                            () => reviewEvidence(e.evidence_id, "reviewed_rejected", null),
                            "Evidence recorded as rejected.")
                      }
                    >
                      Record as rejected
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── DECISION ───────────────────────────────────────────────────────────────────────── */}
      <Card className="p-4">
        <h2 className="font-medium">Verification decision</h2>
        {c.decided_at ? (
          <p className="mt-2 text-sm">
            Decided {fmt(c.decided_at)}.{c.decision_note ? ` Note: ${c.decision_note}` : ""}
          </p>
        ) : (
          <>
            <div className="mt-3">
              <label htmlFor="decision-note" className="block text-sm">Decision note</label>
              <input
                id="decision-note"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                placeholder="Recorded on the case and readable by the second reviewer"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <LifecycleAction
                label="Verify this death"
                availability={availability("decide_case", file)}
                irreversibleConsequence={
                  "Verifying moves the estate to death_verified. A decided case cannot be decided " +
                  "again, and this operator becomes the first of the two reviewers required to " +
                  "release — you will not be able to authorize the release yourself."
                }
                busy={busy === "verify"}
                onConfirm={() =>
                  run("verify", () => decideCase(caseId, "verify", decisionNote.trim() || null),
                      "Case verified.")
                }
              />
              <LifecycleAction
                label="Reject this case"
                availability={availability("decide_case", file)}
                irreversibleConsequence={
                  "Rejecting returns the estate to active and closes this case permanently. A new " +
                  "case would have to be opened by a designated fiduciary."
                }
                busy={busy === "reject"}
                onConfirm={() =>
                  run("reject", () => decideCase(caseId, "reject", decisionNote.trim() || null),
                      "Case rejected.")
                }
              />
            </div>
          </>
        )}
      </Card>

      {/* ── OWNER NOTICE ───────────────────────────────────────────────────────────────────── */}
      <Card className="p-4">
        <h2 className="font-medium">Owner safety notice</h2>
        <p className="mt-1 text-sm">
          <strong>{DISPATCH_SUMMARY_COPY[summary]}</strong>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Dispatch commits an email and an in-app notice to the owner and starts the challenge
          clock. This product cannot observe whether anyone read either one, so nothing here means
          the owner has actually been reached.
        </p>

        {file.owner_notice.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {file.owner_notice.map((n) => (
              <li key={n.id} className="rounded border p-2">
                <span className="font-medium">{noticeDeliveryLabel(n.status)}</span>
                <span className="text-muted-foreground">
                  {" "}· {n.channel} · requested {fmt(n.requested_at)} · {n.attempts} attempt
                  {n.attempts === 1 ? "" : "s"}
                  {n.failure_class ? ` · ${n.failure_class}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <LifecycleAction
            label="Dispatch the owner notice"
            availability={availability("dispatch_owner_notice", file)}
            irreversibleConsequence={
              "This commits an email and an in-app notice to the owner and starts the challenge " +
              "clock from this moment. It cannot be recalled."
            }
            busy={busy === "dispatch"}
            onConfirm={() =>
              run("dispatch", () => dispatchOwnerNotice(c.estate_id), "Owner notice dispatch initiated.")
            }
          />
        </div>
      </Card>

      {/* ── CHALLENGE WINDOW ───────────────────────────────────────────────────────────────── */}
      <Card className="p-4">
        <h2 className="font-medium">Challenge window</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Owner notified at</dt>
            <dd>{fmt(file.lifecycle.owner_notified_at)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Window opened at</dt>
            <dd>{fmt(file.lifecycle.challenge_window_started_at)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Release becomes possible</dt>
            <dd>{file.window.configured ? fmt(file.window.release_eligible_at) : "Not configured"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Elapsed</dt>
            <dd>{file.window.elapsed ? "Yes" : "No"}</dd>
          </div>
        </dl>
        {!file.window.configured && (
          <p className="mt-3 text-sm">
            No window duration is configured, so the window can never elapse and release will be
            refused.
          </p>
        )}
        {file.lifecycle.halted_at && (
          <p className="mt-3 text-sm">
            The owner halted this process at {fmt(file.lifecycle.halted_at)}. This is final — release
            can never proceed from a halt.
          </p>
        )}
        <div className="mt-4">
          <LifecycleAction
            label="Open the challenge window"
            availability={availability("begin_challenge_window", file)}
            irreversibleConsequence={
              "This starts the period during which the owner can halt the process. The window " +
              "cannot be closed early."
            }
            busy={busy === "window"}
            onConfirm={() =>
              run("window", () => beginChallengeWindow(c.estate_id), "Challenge window opened.")
            }
          />
        </div>
      </Card>

      {/* ── RELEASE ────────────────────────────────────────────────────────────────────────── */}
      <Card className="p-4">
        <h2 className="font-medium">Release authorization</h2>
        {file.release.authorized ? (
          <p className="mt-2 text-sm">
            Released {fmt(file.release.authorized.authorized_at)} by a second reviewer. Reason:{" "}
            {file.release.authorized.audit_reason}
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Release requires a second operator. The first reviewer is the operator who decided this
              case; the server derives that identity and this console cannot supply it.
            </p>
            {/*
              ★ THE INELIGIBILITY NOTICE. The server answers `viewer_is_reviewer_a` from its own
              session; the console renders it. It does NOT offer to switch accounts — an operator
              switching identity to satisfy a two-person rule is the rule being defeated, and a
              console that helped would be the tool that defeated it.
            */}
            {/*
              The ineligibility SENTENCE lives on the action, bound to the disabled control by
              `LifecycleAction`. This paragraph adds the part the action cannot: what to do about
              it, and the constraint that makes the rule real. Repeating the sentence here would be
              the same copy twice — noise on the one screen where an operator must read carefully.
            */}
            {file.release.viewer_is_reviewer_a && (
              <p className="mt-2 text-sm font-medium">
                A different operator must sign in with their own account. A shared account satisfies
                the database constraint while defeating the control it exists to enforce.
              </p>
            )}
            <div className="mt-3">
              <label htmlFor="release-reason" className="block text-sm">
                Audit reason (required)
              </label>
              <input
                id="release-reason"
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                placeholder="Recorded permanently on the release authorization"
              />
            </div>
            <div className="mt-3">
              <LifecycleAction
                label="Authorize the release"
                availability={availability("authorize_release", file)}
                irreversibleConsequence={
                  "Releasing makes the estate's death-conditioned grants live. Disclosure cannot be " +
                  "undone, the estate can never return to any earlier state, and the owner can no " +
                  "longer halt the process."
                }
                busy={busy === "release"}
                onConfirm={() =>
                  run("release", () => authorizeRelease(c.estate_id, releaseReason.trim()),
                      "Release authorized.")
                }
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
