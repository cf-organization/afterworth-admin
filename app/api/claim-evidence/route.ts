import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// C1.6b BFF (Backend-for-Frontend). Same-origin proxy so the console CSP stays connect-src 'self' — the
// browser only ever talks to THIS app's origin; the afterworth-api origin never appears in the CSP. This
// route forwards the signed-in admin's access token to afterworth-api /api/claims/view_evidence
// (server-to-server, no CORS), which runs the admin gate INSIDE its RPC and service-role-streams the PDF.
//
// This app holds NO service_role key (locked posture) — the service-role storage read lives only in
// afterworth-api. The route is also middleware-gated (session -> is_admin -> aal2) as defense-in-depth, but
// the authoritative boundary is the RPC gate downstream. Bytes are streamed straight through (no cache).

export const dynamic = "force-dynamic";

const SLOTS = new Set(["death_cert", "executor_id"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: "invalid_request" });
  }
  const o = (raw ?? {}) as Record<string, unknown>;
  const claimId = typeof o.claimId === "string" ? o.claimId.trim() : "";
  const slot = typeof o.slot === "string" ? o.slot.trim() : "";
  if (!UUID_RE.test(claimId) || !SLOTS.has(slot)) {
    return json(400, { error: "invalid_request" });
  }

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return json(401, { error: "auth_required" });
  }

  const apiBase = process.env.AFTERWORTH_API_URL;
  if (!apiBase) {
    console.error("claim-evidence BFF: AFTERWORTH_API_URL not configured");
    return json(502, { error: "config_error" });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBase.replace(/\/+$/, "")}/api/claims/view_evidence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ claimId, slot }),
      cache: "no-store",
    });
  } catch (e) {
    console.error("claim-evidence BFF: upstream fetch failed:", e);
    return json(502, { error: "upstream_error" });
  }

  // Forward the upstream error body/status verbatim (preserves the gate sentinel, e.g.
  // stale_token_reauth_required, so the client can silent-refresh + retry).
  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text || JSON.stringify({ error: "upstream_error" }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  // Pipe the upstream stream straight through (NO arrayBuffer buffering) so this hop also stays under no
  // buffered cap — end-to-end streaming storage → api → BFF → browser, which is what lifts the 4.5MB serving
  // limit up to the upload_policy max (25MB). Forward Content-Length when present (progress bar).
  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? "application/pdf",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers["Content-Length"] = contentLength;
  return new Response(upstream.body, { status: 200, headers });
}
