"use client";
/**
 * THE OPERATOR QUEUE — every death-verification case, and what each one is waiting for.
 *
 * ★ WHAT IS DELIBERATELY NOT HERE. No owner email address (the projection does not carry one), no
 * estate value, no beneficiary, no document. The queue answers "which case needs attention and what
 * kind" and nothing else. `owner_channel_resolvable` is the workflow question an address would have
 * answered, asked properly.
 *
 * ★ AND NO ACTION LIVES ON THIS SCREEN. Every lifecycle act is irreversible or audited, and none of
 * them should be one click from a list where the wrong row is one pixel away. Acting requires
 * opening the case.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { listCases } from "@/lib/cases/rpc";
import { LIFECYCLE_COPY } from "@/lib/cases/lifecycle";
import type { CaseQueueRow, CaseStatus } from "@/lib/cases/types";
import { humanizeError } from "@/lib/errors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FILTERS: Array<{ label: string; value: CaseStatus | null }> = [
  { label: "All", value: null },
  { label: "Open", value: "open" },
  { label: "Verified", value: "verified" },
  { label: "Rejected", value: "rejected" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Halted", value: "halted" }
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default function CasesPage() {
  const [rows, setRows] = useState<CaseQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CaseStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    listCases({ status })
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setError(humanizeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="space-y-6">
      <div>
        {/* ONE level-1 landmark per destination. Every other heading on this screen is subordinate. */}
        <h1 className="text-2xl font-semibold" aria-level={1}>
          Death verification
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cases move through verification, owner notice, a challenge window, and a two-person
          release authorization. Open a case to act on it.
        </p>
      </div>

      <nav aria-label="Filter by case status" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const active = f.value === status;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => setStatus(f.value)}
              aria-pressed={active}
              className={
                "rounded border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 " +
                "focus-visible:outline-offset-2 " +
                (active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")
              }
            >
              {f.label}
            </button>
          );
        })}
      </nav>

      {error && (
        <Card className="border-destructive p-4" role="alert">
          <p className="text-sm">{error}</p>
        </Card>
      )}

      {rows === null && !error && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading cases…
        </p>
      )}

      {rows?.length === 0 && (
        <Card className="p-6">
          <h2 className="font-medium">No cases</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No death-verification case matches this filter.
          </p>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Death-verification cases, newest first. Each row links to the full case.
            </caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">Estate</th>
                <th scope="col" className="py-2 pr-4 font-medium">Case</th>
                <th scope="col" className="py-2 pr-4 font-medium">Lifecycle</th>
                <th scope="col" className="py-2 pr-4 font-medium">Evidence</th>
                <th scope="col" className="py-2 pr-4 font-medium">Required / attained</th>
                <th scope="col" className="py-2 pr-4 font-medium">Owner channel</th>
                <th scope="col" className="py-2 pr-4 font-medium">Opened</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.case_id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/cases/${r.case_id}`}
                      className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {r.estate_name ?? "Unnamed estate"}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge>{r.case_status}</Badge>
                  </td>
                  <td className="py-2 pr-4">
                    {LIFECYCLE_COPY[r.lifecycle_state]}{" "}
                    <span className="text-muted-foreground">({r.lifecycle_state})</span>
                  </td>
                  <td className="py-2 pr-4">
                    {/*
                      Text, not a colour. "3 awaiting review" is the same information to everyone,
                      including an operator who cannot distinguish the two greens a badge would use.
                    */}
                    {r.evidence_awaiting_review > 0
                      ? `${r.evidence_awaiting_review} awaiting review of ${r.evidence_total}`
                      : `${r.evidence_total} reviewed`}
                  </td>
                  <td className="py-2 pr-4">
                    {r.required_level} / {r.attained_level ?? "none attained"}
                  </td>
                  <td className="py-2 pr-4">
                    {r.owner_channel_resolvable ? "Resolvable" : "Not resolvable"}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{formatDate(r.initiated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
