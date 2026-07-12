"use client";
import { useState } from "react";
import { useKeysetList } from "@/lib/useKeysetList";
import type { AuditRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/format";

const SOURCES = ["", "server", "ios_forward", "admin"] as const;

// Full audit read. Rows with source='ios_forward' carry CLIENT-supplied metadata + user_agent — they get
// an "untrusted" badge and, like every other attacker-influenced field, render as text nodes only.
export default function AuditPage() {
  const [draft, setDraft] = useState({ estate: "", actor: "", action: "", source: "" });
  const [filters, setFilters] = useState<Record<string, unknown>>({
    p_estate: null,
    p_actor: null,
    p_action: null,
    p_source: null
  });

  const { rows, loading, error, done, loadMore } = useKeysetList<AuditRow>("admin_list_audit", filters, 50);

  function apply() {
    setFilters({
      p_estate: draft.estate.trim() || null,
      p_actor: draft.actor.trim() || null,
      p_action: draft.action.trim() || null,
      p_source: draft.source || null
    });
  }
  function reset() {
    setDraft({ estate: "", actor: "", action: "", source: "" });
    setFilters({ p_estate: null, p_actor: null, p_action: null, p_source: null });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Audit</h1>
        <p className="text-sm text-muted-foreground">
          Full audit trail. <span className="font-medium">ios_forward</span> rows are client-reported —
          treat their metadata and user-agent as untrusted.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="flex flex-wrap items-end gap-2 rounded border p-3"
      >
        <Field label="Estate ID">
          <input className={inputCls} value={draft.estate} onChange={(e) => setDraft({ ...draft, estate: e.target.value })} placeholder="uuid" />
        </Field>
        <Field label="Actor ID">
          <input className={inputCls} value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} placeholder="uuid" />
        </Field>
        <Field label="Action">
          <input className={inputCls} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} placeholder="e.g. invitation.created" />
        </Field>
        <Field label="Source">
          <select className={inputCls} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "any" : s}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={loading}>Apply</Button>
        <Button type="button" variant="ghost" onClick={reset} disabled={loading}>Reset</Button>
      </form>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40">{error}</p>
      )}

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Estate</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(r.created_at)}</td>
                <td className="px-3 py-2 font-medium">{r.action}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.actor_id}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.estate_id ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.target_table ? `${r.target_table}${r.target_id ? `:${r.target_id.slice(0, 8)}` : ""}` : "—"}
                </td>
                <td className="px-3 py-2">
                  <SourceBadge source={r.source} />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.ip ?? "—"}</td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">view</summary>
                    <div className="mt-1 space-y-1">
                      {r.user_agent && (
                        <p className="max-w-md break-words text-xs">
                          <span className="text-muted-foreground">ua:</span> {r.user_agent}
                        </p>
                      )}
                      <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs">
                        {JSON.stringify(r.metadata ?? {}, null, 2)}
                      </pre>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No audit rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center">
        {!done && rows.length > 0 && (
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        )}
        {loading && rows.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
      </div>
    </div>
  );
}

const inputCls =
  "rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === "ios_forward") {
    return (
      <Badge className="border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        ios_forward · untrusted
      </Badge>
    );
  }
  return <Badge className="border-border bg-muted text-foreground">{source}</Badge>;
}
