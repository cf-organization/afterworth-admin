"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { rpc } from "@/lib/rpc";
import { humanizeError } from "@/lib/errors";
import type { EnrichedClaimPacket } from "@/lib/types";
import type { EvidenceSlot } from "@/lib/evidence";
import { EvidenceViewer } from "@/components/claims/EvidenceViewer";
import { DecidePanel } from "@/components/claims/DecidePanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/format";

// Claim detail — the C1.6b review surface. Evidence viewer ABOVE the decide panel: deciding physically
// happens on the page that shows the death certificate + executor ID (evidence-before-decide enforced by
// layout, backed by the soft nudge in DecidePanel). There is no single-claim RPC, so this resolves the claim
// out of the enriched list's most-recent page (fine at V1 claim volume; a by-id RPC is a follow-up if it grows).
export default function ClaimDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [claim, setClaim] = useState<EnrichedClaimPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<EvidenceSlot, boolean>>({ death_cert: false, executor_id: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await rpc<EnrichedClaimPacket[]>("admin_list_claim_packets_enriched", { p_limit: 200 });
      const found = rows.find((r) => r.id === id) ?? null;
      setClaim(found);
      if (!found) setError("Claim not found in the most recent 200 submissions.");
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const markOpened = useCallback((slot: EvidenceSlot) => {
    setOpened((p) => ({ ...p, [slot]: true }));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (error || !claim) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error ?? "Claim not found."}
        </p>
      </div>
    );
  }

  // Soft nudge input: any attached doc not yet opened this session.
  const hasUnopenedEvidence =
    (!!claim.death_certificate_doc_id && !opened.death_cert) ||
    (!!claim.executor_id_doc_id && !opened.executor_id);

  return (
    <div className="space-y-5">
      <BackLink />

      <div>
        <h1 className="text-xl font-semibold">Claim review</h1>
        <p className="text-sm text-muted-foreground">
          {claim.estate_name ?? "(no estate name)"} · <span className="font-mono text-xs">{claim.estate_id}</span>
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-4 text-sm sm:grid-cols-2">
          <Field
            label="Submitter (executor)"
            value={claim.submitter_name || claim.submitter_email || claim.requested_by}
          />
          <Field label="Status" value={<ClaimStatusInline status={claim.status} />} />
          <Field label="Submitted" value={formatDate(claim.submitted_at)} />
          {claim.decided_at && (
            <Field
              label="Decided"
              value={`${formatDate(claim.decided_at)}${claim.reviewer_email ? " · " + claim.reviewer_email : ""}`}
            />
          )}
          {claim.review_notes && <Field label="Review notes" value={claim.review_notes} />}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence</h2>
        <EvidenceViewer
          claimId={id}
          slot="death_cert"
          label="Death certificate"
          present={!!claim.death_certificate_doc_id}
          title={claim.death_cert_title}
          docType={claim.death_cert_doc_type}
          uploadedAt={claim.death_cert_uploaded_at}
          onOpened={markOpened}
        />
        <EvidenceViewer
          claimId={id}
          slot="executor_id"
          label="Executor ID"
          present={!!claim.executor_id_doc_id}
          title={claim.executor_id_title}
          docType={claim.executor_id_doc_type}
          uploadedAt={claim.executor_id_uploaded_at}
          onOpened={markOpened}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision</h2>
        <DecidePanel claimId={id} status={claim.status} hasUnopenedEvidence={hasUnopenedEvidence} onDecided={load} />
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/claims" className="text-sm text-muted-foreground hover:text-foreground">
      ← Back to claims
    </Link>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words">{value}</div>
    </div>
  );
}

// Mirror of the list page's ClaimStatus honesty: an approved claim shows "release pending (C5)".
function ClaimStatusInline({ status }: { status: string }) {
  const cls =
    status === "rejected"
      ? "border-border bg-muted text-muted-foreground"
      : status === "approved" || status === "released"
        ? "border-green-300 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"
        : "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge className={cls}>{status}</Badge>
      {status === "approved" && <span className="text-xs text-muted-foreground">release pending (C5)</span>}
    </span>
  );
}
