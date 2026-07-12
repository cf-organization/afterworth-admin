"use client";
import { useState } from "react";
import { rpc } from "@/lib/rpc";
import { humanizeError } from "@/lib/errors";
import { useKeysetList } from "@/lib/useKeysetList";
import type { Invitation, CreatedInvitation } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils/format";
import { Copy, Check } from "lucide-react";

const STATUSES = ["", "pending", "matched", "accepted", "declined", "revoked", "expired"] as const;
const inputCls = "rounded border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";

export default function InvitationsPage() {
  const [draft, setDraft] = useState({ estate: "", status: "" });
  const [filters, setFilters] = useState<Record<string, unknown>>({ p_estate: null, p_status: null });
  const list = useKeysetList<Invitation>("admin_list_invitations", filters, 50);

  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);
  const [extendTarget, setExtendTarget] = useState<Invitation | null>(null);

  function apply() {
    setFilters({ p_estate: draft.estate.trim() || null, p_status: draft.status || null });
  }
  function reset() {
    setDraft({ estate: "", status: "" });
    setFilters({ p_estate: null, p_status: null });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Invitations</h1>
          <p className="text-sm text-muted-foreground">Mint, revoke, and extend estate invitations.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New invitation</Button>
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
              <th className="px-3 py-2">Type / Role</th>
              <th className="px-3 py-2">Invitee</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2">Token</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((inv) => (
              <tr key={inv.id} className="border-b align-top last:border-0">
                <td className="px-3 py-2">
                  <div>{inv.estate_display_name ?? <span className="text-muted-foreground">(hidden)</span>}</div>
                  <div className="font-mono text-xs text-muted-foreground">{inv.estate_id}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {inv.kind}
                  {inv.proposed_role !== inv.kind && <> / {inv.proposed_role}</>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {inv.invitee_email_hint ?? inv.invitee_phone_hint ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={inv.status} expired={inv.is_expired} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(inv.expires_at)}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{inv.token_fingerprint}…</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={!["pending", "matched"].includes(inv.status)}
                      onClick={() => setExtendTarget(inv)}
                    >
                      Extend
                    </Button>
                    <Button
                      variant="outline"
                      className="h-7 px-2 text-xs text-red-600"
                      disabled={!["pending", "matched"].includes(inv.status)}
                      onClick={() => setRevokeTarget(inv)}
                    >
                      Revoke
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {list.rows.length === 0 && !list.loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">No invitations.</td>
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

      <CreateInvitationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(c) => {
          setCreateOpen(false);
          setCreated(c);
          list.reload();
        }}
      />
      <RawTokenDialog created={created} onClose={() => setCreated(null)} />
      <RevokeDialog
        target={revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        onDone={() => {
          setRevokeTarget(null);
          list.reload();
        }}
      />
      <ExtendDialog
        target={extendTarget}
        onOpenChange={(o) => !o && setExtendTarget(null)}
        onDone={() => {
          setExtendTarget(null);
          list.reload();
        }}
      />
    </div>
  );
}

function StatusBadge({ status, expired }: { status: string; expired: boolean }) {
  const cls =
    status === "revoked" || status === "declined"
      ? "border-border bg-muted text-muted-foreground"
      : status === "accepted"
        ? "border-green-300 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"
        : "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  return (
    <div className="flex flex-wrap gap-1">
      <Badge className={cls}>{status}</Badge>
      {expired && status !== "revoked" && status !== "accepted" && (
        <Badge className="border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">expired</Badge>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Create — mint an invitation; on success the parent opens the one-time RawTokenDialog.
// ------------------------------------------------------------------------------------------------
function CreateInvitationDialog({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (c: CreatedInvitation) => void;
}) {
  const [estate, setEstate] = useState("");
  const [role, setRole] = useState<"beneficiary" | "professional_delegate">("beneficiary");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [showEstate, setShowEstate] = useState(false);
  const [showInviter, setShowInviter] = useState(false);
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() && !phone.trim()) {
      setError("Provide an invitee email or phone number.");
      return;
    }
    setBusy(true);
    try {
      // In V1, kind and proposed_role are the same value (both ∈ {beneficiary, professional_delegate}).
      const res = await rpc<CreatedInvitation[]>("create_invitation", {
        p_estate: estate.trim(),
        p_kind: role,
        p_proposed_role: role,
        p_invitee_email: email.trim() || null,
        p_invitee_phone: phone.trim() || null,
        p_show_estate_name: showEstate,
        p_show_inviter_name: showInviter,
        p_expires_in_days: days
      });
      const created = res[0];
      if (!created) throw new Error("create returned no row");
      // reset the form (the raw token lives only in the parent's RawTokenDialog, never here)
      setEstate(""); setEmail(""); setPhone(""); setShowEstate(false); setShowInviter(false); setDays(14);
      onCreated(created);
    } catch (e2) {
      setError(humanizeError(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New invitation</DialogTitle>
          <DialogDescription>The raw token is shown once, immediately after creation.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            Estate ID
            <input className={`${inputCls} mt-1 w-full`} required value={estate} placeholder="uuid" onChange={(e) => setEstate(e.target.value)} />
          </label>
          <label className="block text-sm">
            Type
            <select className={`${inputCls} mt-1 w-full`} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="beneficiary">beneficiary</option>
              <option value="professional_delegate">professional_delegate</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              Invitee email
              <input className={`${inputCls} mt-1 w-full`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block text-sm">
              Invitee phone
              <input className={`${inputCls} mt-1 w-full`} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm">
            Expires in (days)
            <input className={`${inputCls} mt-1 w-full`} type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showEstate} onChange={(e) => setShowEstate(e.target.checked)} />
              Show estate name
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showInviter} onChange={(e) => setShowInviter(e.target.checked)} />
              Show inviter name
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------
// Raw token — shown ONCE. Held only in the parent's state; cleared (and thus gone) on close.
// ------------------------------------------------------------------------------------------------
function RawTokenDialog({ created, onClose }: { created: CreatedInvitation | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.raw_token);
    setCopied(true);
  }
  return (
    <Dialog
      open={!!created}
      onOpenChange={(o) => {
        if (!o) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitation created</DialogTitle>
          <DialogDescription>
            Copy this token now — <span className="font-semibold text-foreground">it will not be shown again.</span>{" "}
            Only its fingerprint is stored.
          </DialogDescription>
        </DialogHeader>
        {created && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded border bg-muted px-3 py-2 font-mono text-xs">{created.raw_token}</code>
              <Button variant="outline" className="shrink-0" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Fingerprint {created.token_fingerprint} · expires {formatDate(created.expires_at)}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------
// Revoke — confirm dialog.
// ------------------------------------------------------------------------------------------------
function RevokeDialog({
  target,
  onOpenChange,
  onDone
}: {
  target: Invitation | null;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function revoke() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await rpc("revoke_invitation", { p_invitation_id: target.id });
      onDone();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!target} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke invitation?</DialogTitle>
          <DialogDescription>This immediately invalidates the token. It cannot be undone.</DialogDescription>
        </DialogHeader>
        {target && <p className="text-sm text-muted-foreground">Fingerprint {target.token_fingerprint} · {target.estate_id}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button className="bg-red-600 text-white hover:bg-red-700" onClick={revoke} disabled={busy}>
            {busy ? "Revoking…" : "Revoke"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------
// Extend — new expiry = now + N days (capped server-side at created_at + 90d).
// ------------------------------------------------------------------------------------------------
function ExtendDialog({
  target,
  onOpenChange,
  onDone
}: {
  target: Invitation | null;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function extend() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await rpc("extend_invitation", { p_invitation_id: target.id, p_expires_in_days: days });
      onDone();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!target} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend invitation</DialogTitle>
          <DialogDescription>Sets a new expiry from now (capped at 90 days after creation).</DialogDescription>
        </DialogHeader>
        <label className="block text-sm">
          Extend by (days)
          <input className={`${inputCls} mt-1 w-full`} type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={extend} disabled={busy}>{busy ? "Extending…" : "Extend"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
