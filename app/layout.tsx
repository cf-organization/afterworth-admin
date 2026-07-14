import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "@/providers/Providers";

export const metadata: Metadata = {
  title: "AfterWorth Admin",
  description: "AfterWorth operator console"
};

// The middleware stamps a fresh per-request CSP nonce on every response. A statically
// prerendered page would carry a build-time (or absent) nonce that can never match the
// per-request one, so 'strict-dynamic' 'nonce-…' would block Next's own bootstrap scripts.
// Force dynamic rendering app-wide so the nonce Next injects into its <script> tags is the
// same one the response CSP allows. (Internal console: static caching is not a concern.)
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
