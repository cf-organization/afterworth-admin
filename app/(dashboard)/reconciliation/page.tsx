"use client";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { humanizeError } from "@/lib/errors";
import type { ReconciliationRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// The reconciliation report is the member/designation/grant integrity detector. Read-only. Every
// value (including the JSON `detail`) is rendered as a text node — nothing here becomes markup.
export default function ReconciliationPage() {
  const q = useQuery({
    queryKey: ["reconciliation"],
    queryFn: () => rpc<ReconciliationRow[]>("admin_reconciliation_report")
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Membership / designation / grant integrity. An empty report is the healthy state.
          </p>
        </div>
        <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? "Checking…" : "Refresh"}
        </Button>
      </div>

      {q.isError && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40">
          {humanizeError(q.error)}
        </p>
      )}

      {q.data && q.data.length === 0 && (
        <p className="rounded border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
          No integrity issues detected.
        </p>
      )}

      {q.data && q.data.length > 0 && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Issue</th>
                <th className="px-3 py-2">Estate</th>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((row, i) => (
                <tr key={`${row.issue}-${row.ref_id}-${i}`} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <Badge className={issueClass(row.issue)}>{row.issue}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.estate_id}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.ref_id}</td>
                  <td className="px-3 py-2">
                    <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs">
                      {JSON.stringify(row.detail, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// The CANARY row must never appear (a UNIQUE constraint makes it structurally impossible) — flag it red
// if it ever does; all other issues are operational amber.
function issueClass(issue: string): string {
  return issue === "duplicate_membership_CANARY"
    ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
    : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
}
