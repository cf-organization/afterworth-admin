"use client";
import { useState } from "react";
import Link from "next/link";
import { useKeysetList } from "@/lib/useKeysetList";
import type { EnrichedClaimPacket } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/format";

const STATUSES = ["", "submitted", "under_review", "approved", "rejected", "released"] as const;
const inputCls = "rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";

export default function ClaimsPage() {
  const [draft, setDraft] = useState({ estate: "", status: "" });
  const [filters, setFilters] = useState<Record<string, unknown>>({ p_estate: null, p_status: null });
  const list = useKeysetList<EnrichedClaimPacket>("admin_list_claim_packets_enriched", filters, 50, {
    cursorField: "submitted_at",
    beforeParam: "p_before_submitted"
  });

  function apply() {
    setFilters({ p_estate: draft.estate.trim() || null, p_status: draft.status || null });
  }
  function reset() {
    setDraft({ estate: "", status: "" });
    setFilters({ p_estate: null, p_status: null });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Claims review</h1>
        <p className="text-sm text-muted-foreground">
          Triage of death-claim submissions. Select a claim to open its evidence and record a decision.
        </p>
      </div>

      {/* Release honesty (C5): approving a claim does NOT release assets — that is a separate counsel-gated
          step. Surfaced here and on the detail decide dialog so an operator is never misled. */}
      <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        Approving a claim records a review decision only — it does <span className="font-medium">not</span> release
        any assets. Asset release is a separate counsel-gated step (C5).
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="flex flex-wrap items-end gap-2 rounded border p-3"
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Estate ID
          <input className={inputCls} value={draft.estate} placeholder="uuid" onChange={(e) => setDraft({ ...draft, estate: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Status
          <select className={inputCls} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "any" : s}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={list.loading}>Apply</Button>
        <Button type="button" variant="ghost" onClick={reset} disabled={list.loading}>Reset</Button>
      </form>

      {list.error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40">{list.error}</p>
      )}

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Estate</th>
              <th className="px-3 py-2">Submitter (executor)</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Submitted</th>
              <th className="px-3 py-2">Documents</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((c) => (
              <tr key={c.id} className="border-b align-top last:border-0">
                <td className="px-3 py-2">
                  <div>{c.estate_name ?? <span className="text-muted-foreground">(no name)</span>}</div>
                  <div className="font-mono text-xs text-muted-foreground">{c.estate_id}</div>
                </td>
                <td className="px-3 py-2">
                  <div>{c.submitter_name || c.submitter_email || <span className="text-muted-foreground">(unknown)</span>}</div>
                  {c.submitter_name && c.submitter_email && <div className="text-xs text-muted-foreground">{c.submitter_email}</div>}
                  <div className="font-mono text-xs text-muted-foreground">{c.requested_by}</div>
                </td>
                <td className="px-3 py-2">
                  <ClaimStatus status={c.status} />
                  {c.review_notes && <div className="mt-1 max-w-xs break-words text-xs text-muted-foreground">{c.review_notes}</div>}
                  {c.decided_at && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      decided {formatDate(c.decided_at)}{c.reviewer_email ? <> · {c.reviewer_email}</> : null}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(c.submitted_at)}</td>
                <td className="px-3 py-2 text-xs">
                  <DocMeta label="Death cert" title={c.death_cert_title} uploaded={c.death_cert_uploaded_at} present={!!c.death_certificate_doc_id} />
                  <DocMeta label="Executor ID" title={c.executor_id_title} uploaded={c.executor_id_uploaded_at} present={!!c.executor_id_doc_id} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Link href={`/claims/${c.id}`} className="text-sm font-medium text-primary hover:underline">
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
            {list.rows.length === 0 && !list.loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">No claims.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center">
        {!list.done && list.rows.length > 0 && (
          <Button variant="outline" onClick={list.loadMore} disabled={list.loading}>
            {list.loading ? "Loading…" : "Load more"}
          </Button>
        )}
        {list.loading && list.rows.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
      </div>
    </div>
  );
}

// Boundary 2 (release): an approved claim is NOT released — it shows "release pending (C5)" so an operator is
// never misled that approval == released. Actual release is C5 (counsel-gated, not built).
function ClaimStatus({ status }: { status: string }) {
  const cls =
    status === "rejected"
      ? "border-border bg-muted text-muted-foreground"
      : status === "approved" || status === "released"
        ? "border-green-300 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"
        : "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge className={cls}>{status}</Badge>
      {status === "approved" && <span className="text-xs text-muted-foreground">release pending (C5)</span>}
    </div>
  );
}

// Document METADATA only — title + uploaded date, rendered as escaped text. Explicitly NOT a link/viewer:
// viewing the evidence is Slice C1.6.
function DocMeta({ label, title, uploaded, present }: { label: string; title: string | null; uploaded: string | null; present: boolean }) {
  return (
    <div className="text-muted-foreground">
      {label}:{" "}
      {present ? (
        <>
          <span className="text-foreground">{title ?? "(untitled)"}</span>
          {uploaded && <span> · {formatDate(uploaded)}</span>}
        </>
      ) : (
        <span className="italic">none</span>
      )}
    </div>
  );
}
