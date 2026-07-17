"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchEvidenceBlob, evidenceMessage, EvidenceError, type EvidenceSlot } from "@/lib/evidence";
import { formatDate } from "@/lib/utils/format";

// Per-slot evidence viewer. Fetches the PDF bytes through the same-origin BFF, renders them as an
// <iframe src=blob:> (CSP frame-src blob:), and offers a download. Notifies the parent on first open so the
// decide panel can drop its "you haven't opened the evidence" nudge. Metadata (title/type/date) is escaped text.
export function EvidenceViewer({
  claimId,
  slot,
  label,
  present,
  title,
  docType,
  uploadedAt,
  onOpened,
}: {
  claimId: string;
  slot: EvidenceSlot;
  label: string;
  present: boolean;
  title: string | null;
  docType: string | null;
  uploadedAt: string | null;
  onOpened: (slot: EvidenceSlot) => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  // Revoke the object URL on unmount (and whenever we replace it) — a blob: URL is a live handle to the PDF.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function open() {
    setLoading(true);
    setError(null);
    try {
      const blob = await fetchEvidenceBlob(claimId, slot);
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setBlobUrl(url);
      onOpened(slot);
    } catch (e) {
      setError(evidenceMessage(e instanceof EvidenceError ? e.code : ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{label}</span>{" "}
          {present ? (
            <span className="text-muted-foreground">
              — {title ?? "(untitled)"}
              {docType ? ` · ${docType}` : ""}
              {uploadedAt ? ` · ${formatDate(uploadedAt)}` : ""}
            </span>
          ) : (
            <span className="italic text-muted-foreground">— none attached</span>
          )}
        </div>
        {present && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={open} disabled={loading}>
              {loading ? "Loading…" : blobUrl ? "Reload" : "Open"}
            </Button>
            {blobUrl && (
              <a
                href={blobUrl}
                download={`${slot}.pdf`}
                className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent"
              >
                Download
              </a>
            )}
          </div>
        )}
      </div>
      {error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {blobUrl && (
        <iframe src={blobUrl} title={`${label} preview`} className="mt-2 h-[600px] w-full rounded border bg-white" />
      )}
    </div>
  );
}
