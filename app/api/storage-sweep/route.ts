import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Same-origin BFF for the orphan-sweep (mirrors app/api/claim-evidence): forwards the admin's access token
// server-to-server to afterworth-api /api/claims/sweep_orphans, so the console CSP stays connect-src 'self' and
// this app holds no service_role key. Returns the sweep JSON (dry-run list, or delete result) verbatim.

export const dynamic = "force-dynamic";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
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
    console.error("storage-sweep BFF: AFTERWORTH_API_URL not configured");
    return json(502, { error: "config_error" });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBase.replace(/\/+$/, "")}/api/claims/sweep_orphans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (e) {
    console.error("storage-sweep BFF: upstream fetch failed:", e);
    return json(502, { error: "upstream_error" });
  }

  const text = await upstream.text();
  return new Response(text || JSON.stringify({ error: "upstream_error" }), {
    status: upstream.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
