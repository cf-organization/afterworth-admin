"use client";
import { createClient } from "@/lib/supabase/client";

// Client helper for the C1.6b evidence viewer. Fetches a claim's evidence PDF as a Blob through the
// same-origin BFF (/api/claim-evidence). On a stale-token 403 (the RPC's 15-min freshness gate, surfaced as
// the stale_token_reauth_required sentinel), it silently refreshes the session and retries ONCE — mirroring
// the rpc() client's handler. The browser never sees the afterworth-api origin (connect-src stays 'self').

export type EvidenceSlot = "death_cert" | "executor_id";

export class EvidenceError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
    this.name = "EvidenceError";
  }
}

async function post(claimId: string, slot: EvidenceSlot): Promise<Response> {
  return fetch("/api/claim-evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claimId, slot }),
    cache: "no-store",
  });
}

async function toError(res: Response): Promise<EvidenceError> {
  let code = "upstream_error";
  try {
    const b = (await res.json()) as { error?: unknown };
    if (typeof b?.error === "string") code = b.error;
  } catch {
    /* non-JSON body */
  }
  return new EvidenceError(res.status, code);
}

export async function fetchEvidenceBlob(claimId: string, slot: EvidenceSlot): Promise<Blob> {
  let res = await post(claimId, slot);
  if (res.status === 403) {
    const b = (await res.clone().json().catch(() => ({}))) as { error?: unknown };
    if (b?.error === "stale_token_reauth_required") {
      const { error } = await createClient().auth.refreshSession();
      if (!error) res = await post(claimId, slot);
    }
  }
  if (!res.ok) throw await toError(res);
  return res.blob();
}

// Operator-readable message for an evidence fetch failure code.
export function evidenceMessage(code: string): string {
  switch (code) {
    case "forbidden":
    case "admin_required":
      return "Not authorized — an admin session with MFA is required.";
    case "mfa_required":
      return "Step-up verification (MFA) is required.";
    case "stale_token_reauth_required":
      return "Your session expired — please sign in again.";
    case "evidence_not_found":
      return "No document is attached for this slot.";
    case "evidence_too_large":
      return "This document is too large to preview here.";
    case "storage_error":
      return "The document could not be retrieved from storage.";
    case "auth_required":
      return "You are not signed in.";
    default:
      return "Could not load the document.";
  }
}
