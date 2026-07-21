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
import { formatDate } from "@/lib/utils/format";

// Storage hygiene — the orphan-upload sweeper surface (admin-only; the gate lives in the api RPC). Preview is a
// DRY-RUN (lists orphaned documents-bucket objects; deletes nothing). Delete is confirm:true → service-role
// remove. NO UNDO: deletion is permanent, so it's a deliberate two-step (Preview → confirm dialog → Delete N).
// Both modes are audited server-side (storage.orphans_swept).

interface Orphan {
  object_name: string;
  created_at: string;
  size_bytes: number | null;
}

const GRACE_HOURS = 72;
const MAX = 100;

function humanError(code: string | undefined): string {
  switch (code) {
    case "forbidden":
    case "admin_required":
      return "Not authorized — an admin session with MFA is required.";
    case "mfa_required":
      return "Step-up verification (MFA) is required.";
    case "stale_token_reauth_required":
      return "Your session expired — please sign in again.";
    case "storage_error":
      return "Storage deletion failed. Nothing may have been removed — re-run Preview.";
    case "config_error":
      return "The sweep service is not configured.";
    default:
      return "The sweep request failed.";
  }
}

export default function HygienePage() {
  const [orphans, setOrphans] = useState<Orphan[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function sweep(confirm: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/storage-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm, graceHours: GRACE_HOURS, max: MAX }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(humanError(body?.error));
        return;
      }
      if (confirm) {
        setDeletedCount(body.deleted ?? 0);
        setOrphans([]);
      } else {
        setOrphans(body.orphans ?? []);
        setDeletedCount(null);
      }
    } catch {
      setError("The sweep request failed.");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  }

  const count = orphans?.length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Storage hygiene</h1>
        <p className="text-sm text-muted-foreground">
          Reclaim orphaned evidence uploads — objects in the <span className="font-mono text-xs">documents</span>{" "}
          bucket with no owner record, older than {GRACE_HOURS}h. Preview is a dry run; deletion is permanent.
        </p>
      </div>

      <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        Deletion is <span className="font-medium">irreversible</span> (storage removes the bytes). Always Preview
        first; delete only what you recognize as an abandoned upload. Every run is audited.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => sweep(false)} disabled={loading}>
          {loading ? "Working…" : "Preview orphans"}
        </Button>
        <Button
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={loading || orphans === null || count === 0}
        >
          Delete {count} object{count === 1 ? "" : "s"}
        </Button>
      </div>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {deletedCount !== null && (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">
          Deleted {deletedCount} orphaned object{deletedCount === 1 ? "" : "s"}. This is recorded in the Audit log.
        </p>
      )}

      {orphans !== null && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Object</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2 text-right">Size</th>
              </tr>
            </thead>
            <tbody>
              {orphans.map((o) => (
                <tr key={o.object_name} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs break-all">{o.object_name}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(o.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                    {o.size_bytes != null ? `${Math.round(o.size_bytes / 1024)} KB` : "—"}
                  </td>
                </tr>
              ))}
              {count === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No orphaned objects. Nothing to clean up.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!loading) setConfirmOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {count} orphaned object{count === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              This permanently removes the bytes from storage. There is no undo. The action is audited.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={loading}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => sweep(true)} disabled={loading}>
              {loading ? "Deleting…" : `Delete ${count}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
