import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public paths (no gate). Everything else requires an aal2 admin session.
const PUBLIC = ["/login", "/forbidden"];

// Decode a JWT payload edge-safely (no Buffer). Returns the `aal` claim, or null.
function decodeAal(token?: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return (JSON.parse(atob(padded)) as { aal?: string }).aal ?? null;
  } catch {
    return null;
  }
}

function buildCsp(nonce: string): string {
  const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${supabase}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Pass the nonce to Next via request headers so it stamps its own scripts with it.
  // Next reads the CSP from the REQUEST headers to discover the nonce and inject it into
  // the <script> tags it generates — setting it only on the response is not enough.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + "/"));

  // getUser() validates the session against Supabase (and refreshes cookies via setAll above).
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const withCsp = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  if (!isPublic) {
    // (1) session present
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return withCsp(NextResponse.redirect(url));
    }
    // (2) is_admin BEFORE aal2 — mirror the RPC gate order (auth -> is_admin -> aal2). A non-admin
    //     then gets a clean /forbidden regardless of MFA state, and we never bounce a non-admin into a
    //     step-up they cannot complete (no factor -> the login page loops back to the password form).
    //     is_admin() is granted to authenticated and has no aal requirement, so it answers at aal1.
    const { data: isAdmin, error } = await supabase.rpc("is_admin");
    if (error || isAdmin !== true) {
      const url = request.nextUrl.clone();
      url.pathname = "/forbidden";
      return withCsp(NextResponse.rewrite(url));
    }
    // (3) aal2 — only actual admins reach here, so only admins are asked to step up.
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (decodeAal(session?.access_token) !== "aal2") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("stepup", "1");
      return withCsp(NextResponse.redirect(url));
    }
  }

  return withCsp(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
