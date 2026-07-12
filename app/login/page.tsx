"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// `step` = which form is showing; `busy` = an in-flight request. They are orthogonal:
// a request can be in flight during EITHER step, so folding them into one enum flips the
// wrong form mid-verify.
type Step = "password" | "totp";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [step, setStep] = useState<Step>("password");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function beginTotp(): Promise<boolean> {
    setError(null);
    const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
    if (fErr) return fail(fErr.message);
    const totp = factors?.totp?.[0];
    if (!totp) return fail("No TOTP factor enrolled on this account.");
    const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (cErr) return fail(cErr.message);
    setFactorId(totp.id);
    setChallengeId(ch.id);
    setStep("totp");
    return true;
  }

  function fail(msg: string): false {
    setError(msg);
    return false;
  }

  // If the middleware bounced an already-signed-in aal1 admin here (?stepup), jump straight to TOTP.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data?.currentLevel === "aal2") return router.replace("/invitations");
      if (data?.currentLevel === "aal1" && data?.nextLevel === "aal2") await beginTotp();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: sErr } = await supabase.auth.signInWithPassword({ email, password });
    if (sErr) {
      setError(sErr.message);
      setBusy(false);
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") {
      await beginTotp();
      setBusy(false);
    } else {
      router.replace("/invitations");
    }
  }

  async function onTotp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!factorId || !challengeId) return;
    setBusy(true);
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    if (vErr) {
      setError(vErr.message);
      setBusy(false);
      return;
    }
    router.replace("/invitations");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold">AfterWorth Admin</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          {step === "totp" ? "Enter your authenticator code" : "Administrator sign-in"}
        </p>

        {step !== "totp" ? (
          <form onSubmit={onPassword} className="space-y-3">
            <input
              type="email" required autoComplete="username" placeholder="Email"
              className="w-full rounded border px-3 py-2 text-sm"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password" required autoComplete="current-password" placeholder="Password"
              className="w-full rounded border px-3 py-2 text-sm"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Continue"}
            </Button>
          </form>
        ) : (
          <form onSubmit={onTotp} className="space-y-3">
            <input
              inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code"
              className="w-full rounded border px-3 py-2 text-center text-lg tracking-widest"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
              {busy ? "Verifying…" : "Verify"}
            </Button>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>
    </main>
  );
}
