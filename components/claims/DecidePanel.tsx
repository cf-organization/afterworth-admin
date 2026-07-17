"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rpc, AdminRpcError } from "@/lib/rpc";
import { humanizeError } from "@/lib/errors";

type Decision = "approve" | "reject";

// The decide panel over the SHIPPED admin_decide_claim_packet RPC (0024). Only submitted/under_review claims
// are decidable; a terminal claim shows its verdict + the "release pending (C5)" honesty. Approve/Reject open a
// confirm dialog that (a) restates the release honesty and (b) carries the soft nudge when attached evidence
// was not opened. A contradictory re-decision comes back as claim_already_decided (P0001) — surfaced gracefully,
// never a silent flip.
export function DecidePanel({
  claimId,
  status,
  hasUnopenedEvidence,
  onDecided,
}: {
  claimId: string;
  status: string;
  hasUnopenedEvidence: boolean;
  onDecided: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<Decision | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decidable = status === "submitted" || status === "under_review";
  if (!decidable) {
    return (
      <p className="text-sm text-muted-foreground">
        This claim is <span className="font-medium">{status}</span> — no further decision is available.
        {status === "approved" &&
          " Approval does not release any assets; release is a separate counsel-gated step (C5)."}
      </p>
    );
  }

  async function confirm() {
    if (!pending) return;
    setSubmitting(true);
    setError(null);
    try {
      await rpc<string>("admin_decide_claim_packet", {
        p_claim_id: claimId,
        p_decision: pending,
        p_review_notes: notes.trim() || null,
      });
      setPending(null);
      setNotes("");
      onDecided();
    } catch (e) {
      if (e instanceof AdminRpcError && e.message.includes("claim_already_decided")) {
        setError("This claim was already decided elsewhere. Reload to see its current status.");
      } else {
        setError(humanizeError(e));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Review notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Rationale for the decision…"
          className="rounded border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      <div className="flex gap-2">
        <Button onClick={() => setPending("approve")}>Approve</Button>
        <Button variant="outline" onClick={() => setPending("reject")}>
          Reject
        </Button>
      </div>
      {error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o && !submitting) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending === "approve" ? "Approve claim" : "Reject claim"}</DialogTitle>
            <DialogDescription>
              {pending === "approve"
                ? "Approving records your decision. It does NOT release any assets — release is a separate counsel-gated step (C5)."
                : "Rejecting records your decision. The claimant may submit a new claim."}
            </DialogDescription>
          </DialogHeader>
          {hasUnopenedEvidence && (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              You have not opened all attached evidence. Decide anyway?
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={submitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={confirm} disabled={submitting}>
              {submitting ? "Submitting…" : pending === "approve" ? "Confirm approve" : "Confirm reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
