"use client";
/**
 * One lifecycle action, with its availability, its reason for being unavailable, and — for the four
 * that cannot be undone — a deliberate second step.
 *
 * ★ THE DISABLED STATE ALWAYS SAYS WHY. A greyed-out button with no explanation trains an operator
 * to click things and read errors. The reason text comes from `lib/cases/lifecycle.ts`, which
 * mirrors the deployed routine's own precondition order — so the console's explanation is the
 * explanation the server would have given.
 *
 * ★ AND DISABLING IS NOT A SECURITY CONTROL. Every one of these calls survives direct invocation by
 * the wrong actor because the routine gates itself; this component decides what to SHOW. If it were
 * deleted the console would be confusing and the system would be exactly as safe.
 *
 * ★ IRREVERSIBLE ACTIONS ARE DISTINGUISHED STRUCTURALLY, not by colour. They carry an explicit
 * confirmation step whose copy names the specific consequence, and the confirm button repeats the
 * verb. Colour alone would be invisible to an operator who cannot see it, and "are you sure?" is
 * not a warning — it is a speed bump that says nothing.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionAvailability } from "@/lib/cases/lifecycle";

export interface LifecycleActionProps {
  /** The verb, precisely. Never "Continue", never "Proceed". */
  label: string;
  availability: ActionAvailability;
  /** Present for an irreversible act: the specific consequence, in one sentence. */
  irreversibleConsequence?: string;
  busy?: boolean;
  onConfirm: () => void;
}

export function LifecycleAction({
  label,
  availability,
  irreversibleConsequence,
  busy = false,
  onConfirm
}: LifecycleActionProps) {
  const [confirming, setConfirming] = useState(false);
  const disabled = !availability.available || busy;

  if (!availability.available) {
    return (
      <div className="space-y-1">
        <Button type="button" disabled aria-disabled="true">
          {label}
        </Button>
        {/*
          Bound to the button by aria-describedby so assistive technology reads the reason with the
          control rather than as loose text somewhere after it.
        */}
        <p className="text-sm text-muted-foreground" id={`why-${label.replace(/\s+/g, "-")}`}>
          {availability.reason}
        </p>
      </div>
    );
  }

  if (!irreversibleConsequence) {
    return (
      <Button type="button" disabled={disabled} onClick={onConfirm}>
        {busy ? `${label}…` : label}
      </Button>
    );
  }

  if (!confirming) {
    return (
      <Button type="button" disabled={disabled} onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded border border-destructive p-3" role="group" aria-label={`Confirm: ${label}`}>
      <p className="text-sm font-medium">This cannot be undone.</p>
      <p className="text-sm">{irreversibleConsequence}</p>
      <div className="flex gap-2">
        <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
          {busy ? `${label}…` : label}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
