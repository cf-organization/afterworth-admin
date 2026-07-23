"use client";
import { useCallback, useEffect, useState } from "react";
import { rpc, AdminRpcError } from "@/lib/rpc";
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

// Read-only heartbeat from purge_outbox_health() — the daily drain cron fails SILENTLY, so this makes a stalled
// queue visible. NO mutations; pairs with the sweep below.
interface PurgeHealth {
  pending_count: number;
  failed_count: number;
  purged_last_24h: number;
  oldest_pending_age_seconds: number;
  max_attempts_seen: number;
  last_successful_drain_at: string | null;
  orphan_candidate_count: number;
}

const GRACE_HOURS = 72;
const MAX = 100;
// Degraded when the oldest un-purged row is older than one missed DAILY cron + margin. Below this, a pending row
// is NORMAL (waiting for the client-immediate purge or the next daily drain) and renders as fine — no standing
// yellow (an alarm channel that's always warning trains people to ignore it).
const DEGRADED_AGE_SECONDS = 26 * 3600;

function humanizeAge(seconds: number): string {
  if (seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

function Metric({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`font-medium ${alert ? "text-red-700 dark:text-red-300" : ""}`}>{value}</dd>
    </div>
  );
}

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

  const [health, setHealth] = useState<PurgeHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      setHealth(await rpc<PurgeHealth>("purge_outbox_health"));
    } catch (e) {
      setHealthError(humanError(e instanceof AdminRpcError ? e.code : undefined));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  const degraded =
    health != null && (health.failed_count > 0 || health.oldest_pending_age_seconds > DEGRADED_AGE_SECONDS);

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

      {/* Purge-queue heartbeat (read-only). Quiet when fine; loudly degraded only when it actually is — no
          standing yellow. The daily drain cron fails silently, so oldest-pending age is the headline. */}
      <section
        className={`rounded border px-4 py-3 ${
          degraded
            ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
            : "border-border"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            Purge queue{" "}
            {health == null ? null : degraded ? (
              <span className="text-red-700 dark:text-red-300">— attention needed</span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400">— healthy</span>
            )}
          </h2>
          <Button size="sm" variant="ghost" onClick={() => void fetchHealth()} disabled={healthLoading}>
            {healthLoading ? "…" : "Refresh"}
          </Button>
        </div>

        {healthError && <p className="mt-1 text-sm text-red-700 dark:text-red-300">{healthError}</p>}

        {health && degraded && (
          <ul className="mt-2 list-disc pl-5 text-sm text-red-800 dark:text-red-300">
            {health.failed_count > 0 && (
              <li>
                {health.failed_count} failed purge{health.failed_count === 1 ? "" : "s"} — investigate or re-drain.
              </li>
            )}
            {health.oldest_pending_age_seconds > DEGRADED_AGE_SECONDS && (
              <li>
                Oldest pending {humanizeAge(health.oldest_pending_age_seconds)} — over 26h, a daily drain may have
                been missed.
              </li>
            )}
          </ul>
        )}

        {health && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Metric label="Pending" value={String(health.pending_count)} />
            <Metric label="Failed" value={String(health.failed_count)} alert={health.failed_count > 0} />
            <Metric
              label="Oldest pending"
              value={humanizeAge(health.oldest_pending_age_seconds)}
              alert={health.oldest_pending_age_seconds > DEGRADED_AGE_SECONDS}
            />
            <Metric label="Purged (24h)" value={String(health.purged_last_24h)} />
            <Metric label="Max attempts" value={String(health.max_attempts_seen)} />
            <Metric
              label="Last drain"
              value={health.last_successful_drain_at ? formatDate(health.last_successful_drain_at) : "never"}
            />
            <Metric label="Orphan candidates" value={String(health.orphan_candidate_count)} />
          </dl>
        )}
      </section>

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
