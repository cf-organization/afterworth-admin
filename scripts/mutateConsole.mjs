#!/usr/bin/env node
/**
 * Mutation harness for the operator console's truth-telling rules.
 *
 * ★ WHY THIS REPOSITORY NEEDED ONE. `npm test` reports "100 tests passed". That sentence is only
 * worth something if the tests can FAIL, and the three rules Phase 11-OC / Phase C adds are exactly
 * the kind that look enforced and might not be:
 *
 *   · the re-notice control appears iff the SERVER says eligible;
 *   · a `dispatched` notice with NO acceptance record is never labelled as accepted;
 *   · nothing on the case screen claims mailbox DELIVERY.
 *
 * Each is a single, plausible edit away from being wrong — the kind of edit a contributor makes
 * while "simplifying" a label or "not making the operator wait for the server". So each is written
 * here as that edit, and the suite must fail. `NOT_DETECTED` is the finding.
 *
 * ★ IT NEVER WRITES TO YOUR CHECKOUT. Every mutation happens inside a throwaway `git worktree`
 * seeded from the WORKING STATE (patch + untracked files), for the reason the api repo's
 * `scripts/mutateSqlAuthorization.mjs` records: cleanup discipline has failed before, once
 * destroying uncommitted work via a file-level `git checkout`. The developer's tree is not the thing
 * being mutated, so no crash can strand a mutation in it. The worktree's own `node_modules` is
 * SYMLINKED rather than reinstalled — a fresh `npm ci` per mutation would take minutes and prove
 * nothing extra.
 *
 * ★ AND IT PROVES THE MUTATION ACTUALLY APPLIED. A replacement whose `from` no longer matches
 * silently mutates nothing, and the suite then passes for the most misleading possible reason: the
 * code under test was never changed. Every mutation asserts the substitution occurred, exactly once,
 * before the suite runs — a miss is HARNESS_FAILURE, never DETECTED.
 *
 * Usage:  node scripts/mutateConsole.mjs [--only <id>]
 * Exit:   0 every mutation was detected · 1 a mutation survived · 2 the harness could not run
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERDICT = Object.freeze({
  DETECTED: 'DETECTED',
  NOT_DETECTED: 'NOT_DETECTED',
  HARNESS_FAILURE: 'HARNESS_FAILURE',
});

const MUTATIONS = Object.freeze([
  {
    id: 'console-availability-diverges-from-server',
    why: 'THE CONSOLE DECIDES ELIGIBILITY ITSELF. Written as the edit somebody would actually make — '
      + '"the server already re-checks, so let the operator try" — it offers the re-notice control on '
      + 'every case. On an accepted notice that means an operator queues a second email to a living '
      + 'person about their own death process and the door refuses it; on a stale case it means a '
      + 'control that trains operators to click and read errors. The server verdict is the ONLY '
      + 'authority for this action.',
    file: 'lib/cases/lifecycle.ts',
    from: '  if (verdict.eligible) return AVAILABLE;',
    to: '  return AVAILABLE;',
  },
  {
    id: 'console-labels-legacy-dispatched-as-accepted',
    why: 'THE ACCEPTANCE FACT IGNORED, AND THE STATUS TRUSTED INSTEAD. This is the single most '
      + 'dangerous console edit in the phase: a pre-Phase-A row carries `dispatched` with NO '
      + 'acceptance record, and labelling it "Provider accepted notice" tells an operator a living '
      + 'owner was reached when nobody recorded whether they were — on the one screen where that '
      + 'question decides whether an estate is released.',
    file: 'lib/cases/lifecycle.ts',
    from: '      return notice.notice_accepted_at\n        ? "Provider accepted notice"\n        : "Legacy acceptance fact unavailable";',
    to: '      return "Provider accepted notice";',
  },
  {
    id: 'console-says-delivered',
    why: 'THE WORD THIS PRODUCT MAY NOT SAY. `providerAccepted` means an SMTP relay took the message; '
      + 'it is not delivery, not receipt, not reading. "Delivered" is the strongest-sounding and '
      + 'least true label available, and it is exactly what a well-meaning copy pass reaches for '
      + 'because it reads better than "Provider accepted notice".',
    file: 'lib/cases/lifecycle.ts',
    from: '      return notice.notice_accepted_at\n        ? "Provider accepted notice"\n        : "Legacy acceptance fact unavailable";',
    to: '      return notice.notice_accepted_at\n        ? "Delivered to the owner"\n        : "Legacy acceptance fact unavailable";',
  },
  {
    id: 'console-summary-reads-array-order',
    why: 'THE ESTATE SUMMARY READS `owner_notice[0]` INSTEAD OF THE CURRENT GENERATION. It agrees '
      + 'with the current projection ordering today and is not the invariant: `is_current` is. After '
      + 'a re-notice the array holds a retired generation and a live one, and a summary anchored on '
      + 'ordering would describe whichever the server happened to list first.',
    file: 'lib/cases/lifecycle.ts',
    from: '  return file.owner_notice.find((n) => n.channel === "email" && n.is_current);',
    to: '  return file.owner_notice.filter((n) => n.channel === "email")[0];',
  },
  {
    id: 'console-reissue-accepts-a-blank-reason',
    why: 'THE REASON REQUIREMENT DROPPED FROM THE SCREEN. The server still refuses a blank reason, so '
      + 'this does not create an unaudited write — it creates a control that looks available and '
      + 'fails, which is how operators learn to ignore errors on the one screen where they must not.',
    file: 'app/(dashboard)/cases/[id]/page.tsx',
    from: '              reissueReason.trim().length === 0 && reissueAvailability(file).available',
    to: '              false && reissueAvailability(file).available',
  },
  {
    id: 'console-claims-the-owner-was-warned',
    why: 'THE SUCCESS MESSAGE OVERCLAIMS. A successful call means NEW WARNING QUEUED — not sent, not '
      + 'accepted, not delivered, and certainly not read. An operator who reads "the owner has been '
      + 'notified" stops looking, and the estate that still needs remediating looks handled.',
    file: 'app/(dashboard)/cases/[id]/page.tsx',
    from: '                "New notice queued. It has not been sent yet, and no provider acceptance is recorded."',
    to: '                "The owner has been notified."',
  },
]);

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const selected = only ? MUTATIONS.filter((m) => m.id === only) : MUTATIONS;
if (selected.length === 0) {
  console.error(`✗ CANNOT RUN — no mutation named "${only}". Known: ${MUTATIONS.map((m) => m.id).join(', ')}`);
  process.exit(2);
}

const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
/** No `.trim()`: a unified diff's trailing blank context line is one space, and trimming corrupts it. */
const gitRaw = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8' });

const treeBefore = git(['status', '--porcelain']);
const diffStatBefore = git(['diff', '--stat']);
const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
const workingPatch = gitRaw(['diff', 'HEAD']);

if (!existsSync(join(ROOT, 'node_modules'))) {
  console.error('✗ CANNOT RUN — node_modules is absent. Run `npm ci` first; the harness symlinks it');
  console.error('  into each throwaway worktree rather than reinstalling per mutation.');
  process.exit(2);
}

/** Baseline: the suite must PASS before any mutation, or every "DETECTED" below is meaningless. */
const baseline = spawnSync('npx', ['vitest', 'run'], { cwd: ROOT, encoding: 'utf8' });
if (baseline.status !== 0) {
  console.error('✗ CANNOT RUN — the suite fails BEFORE any mutation, so a failure afterwards would');
  console.error('  prove nothing. Fix the tree first.');
  console.error((baseline.stdout ?? '').split('\n').slice(-20).join('\n'));
  process.exit(2);
}
console.log('✓ baseline: the suite passes unmutated\n');

const results = [];
for (const m of selected) {
  const dir = mkdtempSync(join(tmpdir(), 'aw-console-mut-'));
  const wt = join(dir, 'wt');
  let verdict = VERDICT.HARNESS_FAILURE;
  let detail = '';
  try {
    git(['worktree', 'add', '--detach', wt, 'HEAD']);
    if (workingPatch.length > 0) {
      const patchFile = join(dir, 'working.patch');
      writeFileSync(patchFile, workingPatch, 'utf8');
      execFileSync('git', ['apply', '--whitespace=nowarn', patchFile], { cwd: wt });
    }
    for (const f of untracked) {
      const dest = join(wt, f);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(ROOT, f), dest);
    }
    symlinkSync(join(ROOT, 'node_modules'), join(wt, 'node_modules'), 'dir');

    const target = join(wt, m.file);
    const before = readFileSync(target, 'utf8');
    const occurrences = before.split(m.from).length - 1;
    if (occurrences !== 1) {
      detail = `anchor occurs ${occurrences} times (expected exactly 1)`;
      throw new Error(detail);
    }
    writeFileSync(target, before.replace(m.from, m.to), 'utf8');
    if (readFileSync(target, 'utf8') === before) {
      detail = 'the replacement produced an identical file';
      throw new Error(detail);
    }

    const run = spawnSync('npx', ['vitest', 'run'], { cwd: wt, encoding: 'utf8' });
    verdict = run.status === 0 ? VERDICT.NOT_DETECTED : VERDICT.DETECTED;
    if (verdict === VERDICT.NOT_DETECTED) {
      detail = 'the suite still passes with the rule removed';
    }
  } catch (e) {
    verdict = VERDICT.HARNESS_FAILURE;
    detail = detail || String(e.message ?? e).split('\n')[0];
  } finally {
    try { git(['worktree', 'remove', '--force', wt]); } catch { /* the rmSync below is the backstop */ }
    rmSync(dir, { recursive: true, force: true });
  }
  results.push({ id: m.id, verdict, detail });
  const mark = verdict === VERDICT.DETECTED ? '✓' : '✗';
  console.log(`${mark} ${m.id.padEnd(46)} ${verdict}${detail ? ` — ${detail}` : ''}`);
}

git(['worktree', 'prune']);

/**
 * ★ THE ANTI-COLLATERAL-DAMAGE CHECK, VERIFIED RATHER THAN ASSUMED. A mutation workflow that cannot
 * prove it left the tree unchanged is a workflow that quietly deletes work — this repository's
 * sibling has the scar.
 */
const treeAfter = git(['status', '--porcelain']);
const diffStatAfter = git(['diff', '--stat']);
if (treeAfter !== treeBefore || diffStatAfter !== diffStatBefore) {
  console.error('\n✗ THE WORKING TREE CHANGED. Investigate before trusting any verdict above.');
  process.exit(2);
}
console.log('\nworking tree unchanged (verified, not assumed)');

const survived = results.filter((r) => r.verdict !== VERDICT.DETECTED);
if (survived.length > 0) {
  console.error(`\n✗ ${survived.length} mutation(s) were not detected.`);
  process.exit(1);
}
console.log(`✓ all ${results.length} console mutations DETECTED`);
