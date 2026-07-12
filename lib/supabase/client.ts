import { createBrowserClient } from "@supabase/ssr";

// Browser client — uses the PUBLISHABLE key only. The signed-in admin's JWT authorizes RPC calls;
// RLS + the RPC-internal gates are the real security. No service_role key exists in this app.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
