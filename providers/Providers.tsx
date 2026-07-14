"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// TanStack Query only. next-themes was removed DELIBERATELY: its FOUC-prevention inline script cannot
// carry the CSP nonce (React blanks the nonce attribute in SSR), so it was the one script the strict
// prod CSP blocked. On a security console the CSP console is an ALARM channel — a permanently-present
// benign violation normalizes the report and could mask a real blocked injection, so it must stay
// silent by default. Light theme only until a nonce-compatible theming approach exists.
export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } }
      })
  );
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
