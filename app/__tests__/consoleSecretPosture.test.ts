/**
 * PHASE 11-K — the console holds no secret and buys no privilege.
 *
 * ★ THE POSTURE THIS PINS. `afterworth-admin` authenticates as the SIGNED-IN ADMIN and calls
 * Supabase RPCs with that person's own JWT. There is no `service_role` key in the client, the
 * server components, the middleware or the environment — the only secret-holding surface in the
 * product is `afterworth-api`. Adding one here would give every route in this application the
 * ability to bypass every gate the RPCs enforce, and it would do so silently.
 *
 * ★ A SOURCE AUDIT IS THE RIGHT INSTRUMENT HERE, unlike the disclosure rules next door. A secret
 * key is not something a render can observe: a `service_role` client constructed in a route handler
 * produces no DOM at all. What can be observed is whether the string ever appears in a position
 * that reads an environment variable.
 *
 * ★ AND IT MUST DISTINGUISH A MENTION FROM A USE. Four files in this repository say the words
 * "service_role" — all four in comments explaining that this app does not hold one. A rule that
 * matched the token would condemn the documentation of the very property it exists to protect,
 * which is the token-versus-usage trap. So the rule matches an ENV READ, not a word.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const DIRS = ["app", "lib", "components", "providers"];

/**
 * ★ TEST FILES ARE EXCLUDED, AND THAT IS NOT A CONVENIENCE. This very file lists
 * `SUPABASE_SECRET_KEY`, `RESEND_API_KEY` and `on_executor_claim` as the tokens it forbids, and the
 * disclosure suite next door lists them too. A scanner that read its own forbidden vocabulary would
 * condemn the audits written to prevent exactly what it is looking for — documentation and test
 * fixtures becoming phantom debt. It found itself on the first run, which is how this exclusion
 * came to exist rather than being assumed.
 *
 * The exclusion is asserted non-vacuous in §0: a filter that silently matched nothing would put the
 * test files back in the scan set and re-create the false positive.
 */
const isTestFile = (rel: string) =>
  rel.includes(`__tests__${path.sep}`) || /\.test\.(ts|tsx)$/.test(rel);

function walk(dir: string, out: string[] = []): string[] {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const allFiles = [...DIRS.flatMap((d) => walk(d)), "middleware.ts"].filter((f) =>
  fs.existsSync(path.join(ROOT, f))
);
/** Production surfaces only — the things that ship and can hold a key. */
const files = allFiles.filter((f) => !isTestFile(f));

/** Comments stripped, string literals kept — an env key IS a string literal. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/\s\/\/.*$/, ""))
    .join("\n");
}

describe("0 · the audit is reading something", () => {
  it("resolves a substantial, non-empty scan set", () => {
    // Assert the scan set BEFORE evaluating any rule: a mis-resolved ROOT would make every absence
    // rule below pass against an empty list.
    expect(files.length).toBeGreaterThan(15);
    expect(files).toContain("middleware.ts");
    expect(files.some((f) => f.startsWith(path.join("lib", "cases")))).toBe(true);
  });

  it("the test-file exclusion actually removes files, and removes only test files", () => {
    // ★ A FILTER THAT FILTERS NOTHING IS THE FAILURE MODE THIS GUARDS. If `isTestFile` ever stopped
    // matching, the audits would re-enter the scan set and their forbidden-token lists would be
    // reported as production secrets — a loud false positive that someone would "fix" by deleting
    // the rule. Prove the filter bites, and prove it bites nothing else.
    const removed = allFiles.filter(isTestFile);
    expect(removed.length).toBeGreaterThanOrEqual(3);
    expect(removed.every((f) => f.includes("__tests__") || f.endsWith(".test.ts") || f.endsWith(".test.tsx"))).toBe(true);
    expect(files.some(isTestFile)).toBe(false);
  });

  it("comment stripping keeps code and removes prose (both directions)", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/cases/rpc.ts"), "utf8");
    const stripped = stripComments(src);
    expect(src).toContain("service_role"); // the header explains the posture…
    expect(stripped).not.toContain("service_role"); // …and it is prose, not code
    expect(stripped).toContain("admin_list_death_verification_cases");
  });
});

describe("1 · no secret key is read anywhere in this application", () => {
  const FORBIDDEN_ENV = [
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "CRON_SECRET"
  ];

  for (const key of FORBIDDEN_ENV) {
    it(`never reads process.env.${key}`, () => {
      for (const f of files) {
        const code = stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"));
        expect(code, `${f} reads ${key}`).not.toContain(key);
      }
    });
  }

  it("the ONLY Supabase env keys read are the public pair", () => {
    // POSITIVE CONTROL: the public keys ARE read, so an empty result would be suspicious.
    const all = files
      .map((f) => stripComments(fs.readFileSync(path.join(ROOT, f), "utf8")))
      .join("\n");
    const supabaseEnv = [...all.matchAll(/process\.env\.([A-Z0-9_]*SUPABASE[A-Z0-9_]*)/g)]
      .map((m) => m[1]);
    expect(supabaseEnv.length).toBeGreaterThan(0);
    expect([...new Set(supabaseEnv)].sort()).toEqual([
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_URL"
    ]);
  });
});

describe("2 · the lifecycle doors are called with the operator's own JWT", () => {
  it("every Phase 11 RPC goes through lib/rpc, never a hand-built client", () => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, "lib/cases/rpc.ts"), "utf8"));
    // POSITIVE CONTROL: the module really does call the doors.
    expect(src).toContain("authorize_release");
    expect(src).toContain("dispatch_owner_safety_notice");
    // It reaches them only via the shared helper, which sends the signed-in admin's token and
    // silently refreshes a stale one.
    expect(src).toContain('from "@/lib/rpc"');
    expect(src).not.toContain("createClient(");
    expect(src).not.toContain("createServerClient");
  });

  /**
   * ★ THE PARAMETER ABSENCE IS THE SAFETY PROPERTY. `authorize_release` derives reviewer A from the
   * verified case's decider and reviewer B from auth.uid(). A console that could send a reviewer
   * would let a caller nominate a first reviewer and satisfy the two-person rule against someone
   * who never reviewed anything — so the client must not have the parameter to send.
   */
  it("authorizeRelease sends an estate and a reason, and no reviewer", () => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, "lib/cases/rpc.ts"), "utf8"));
    const fn = src.slice(src.indexOf("export async function authorizeRelease"));
    const body = fn.slice(0, fn.indexOf("}\n"));
    expect(body).toContain("p_estate");
    expect(body).toContain("p_reason");
    expect(body).not.toMatch(/reviewer/i);
    expect(body).not.toMatch(/p_uid|p_actor|p_admin/);
  });

  it("dispatchOwnerNotice sends an estate and no address", () => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, "lib/cases/rpc.ts"), "utf8"));
    const fn = src.slice(src.indexOf("export async function dispatchOwnerNotice"));
    const body = fn.slice(0, fn.indexOf("}\n"));
    expect(body).toContain("p_estate");
    expect(body).not.toMatch(/email|recipient|address|p_to\b/i);
  });
});

describe("3 · encrypted instructions never enter the operator flow", () => {
  it("no console surface names the dormant subsystem", () => {
    const FORBIDDEN = [
      "encrypted_instructions",
      "on_executor_claim",
      "release_condition",
      "unwrap",
      "data_key",
      "master_key"
    ];
    for (const f of files) {
      const code = stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"));
      for (const token of FORBIDDEN) {
        expect(code, `${f} names ${token}`).not.toContain(token);
      }
    }
  });
});
