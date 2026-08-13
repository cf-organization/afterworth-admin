/**
 * PHASE 11-K — the operator console renders the workflow and never the estate, and never claims a
 * person was notified.
 *
 * ★ WHY THIS RENDERS RATHER THAN GREPS. A source regex over a screen file can prove a string is
 * absent from the FILE; it cannot prove the string is absent from what a viewer SEES, because the
 * text arrives from props, from a lookup table, or from a shared component. Every disclosure rule
 * here therefore renders the real screen with a real payload and asks the DOM.
 *
 * ★ AND EVERY ABSENCE IS PAIRED WITH A PRESENCE. A screen that failed to render at all would pass
 * every "is not in the document" assertion in this file. So each block first proves the instrument
 * can see something it should see.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { CaseFile, CaseQueueRow } from "@/lib/cases/types";

const OWNER_ADDRESS = "owner@example.invalid";
const STORAGE_PATH = "estates/e1/death-cert.pdf";

const queueRow: CaseQueueRow = {
  case_id: "c1",
  estate_id: "e1",
  estate_name: "Rivera Family Estate",
  case_status: "open",
  lifecycle_state: "death_verification_pending",
  event_type: "death",
  initiated_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  initiator_capacity: "executor",
  jurisdiction_context: "US-CA",
  required_level: "attestation",
  attained_level: null,
  evidence_total: 2,
  evidence_awaiting_review: 1,
  owner_channel_resolvable: true,
  decided_at: null
};

const caseFile: CaseFile = {
  case: {
    case_id: "c1",
    estate_id: "e1",
    estate_name: "Rivera Family Estate",
    status: "verified",
    event_type: "death",
    initiated_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-04T00:00:00Z",
    initiator_capacity: "executor",
    jurisdiction_context: "US-CA",
    required_level_at_initiation: "attestation",
    required_level_live: "attestation",
    attained_level: "attestation",
    decided_at: "2026-08-03T00:00:00Z",
    decision_note: "Certificate matched the registry record.",
  },
  initiator: { user_id: "u1", email: "dana@example.invalid", name: "Dana Fiduciary", capacity: "executor" },
  lifecycle: {
    state: "challenge_window",
    owner_notified_at: "2026-08-04T00:00:00Z",
    challenge_window_started_at: "2026-08-04T00:05:00Z",
    halted_at: null,
    released_at: null,
    updated_at: "2026-08-04T00:05:00Z"
  },
  window: {
    duration: "7 days",
    configured: true,
    release_eligible_at: "2026-08-11T00:00:00Z",
    elapsed: false
  },
  owner_notice: [{
    id: "n1",
    channel: "email",
    notice_kind: "death_process.window_opened",
    status: "queued",
    requested_at: "2026-08-04T00:00:00Z",
    dispatched_at: null,
    attempts: 0,
    failure_class: null
  }],
  evidence: [{
    evidence_id: "ev1",
    document_id: "d1",
    title: "Death certificate",
    doc_type: "death_certificate",
    uploaded_at: "2026-08-02T00:00:00Z",
    submitted_at: "2026-08-02T01:00:00Z",
    review_status: "received",
    reviewed_at: null,
    review_note: null
  }],
  release: { reviewer_a: "admin-a", viewer_is_reviewer_a: false, authorized: null }
};

vi.mock("@/lib/cases/rpc", () => ({
  listCases: vi.fn(async () => [queueRow]),
  getCase: vi.fn(async () => caseFile),
  reviewEvidence: vi.fn(),
  setAttainedLevel: vi.fn(),
  decideCase: vi.fn(),
  dispatchOwnerNotice: vi.fn(),
  beginChallengeWindow: vi.fn(),
  authorizeRelease: vi.fn(),
  ownerNoticeCensus: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/cases",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() })
}));

import CasesPage from "@/app/(dashboard)/cases/page";
import CaseDetailPage from "@/app/(dashboard)/cases/[id]/page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the queue", () => {
  it("renders the case (the positive control for every absence below)", async () => {
    render(<CasesPage />);
    expect(await screen.findByText("Rivera Family Estate")).toBeInTheDocument();
    expect(screen.getByText(/1 awaiting review of 2/)).toBeInTheDocument();
  });

  it("shows channel RESOLVABILITY and no address", async () => {
    render(<CasesPage />);
    await screen.findByText("Rivera Family Estate");
    expect(screen.getByText("Resolvable")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(OWNER_ADDRESS);
    expect(document.body.textContent).not.toContain("@");
  });

  it("carries no action control — acting requires opening the case", async () => {
    render(<CasesPage />);
    await screen.findByText("Rivera Family Estate");
    for (const verb of [/dispatch/i, /authorize/i, /verify/i, /release/i]) {
      expect(screen.queryByRole("button", { name: verb })).not.toBeInTheDocument();
    }
  });

  it("expresses evidence backlog as text, never as colour alone", async () => {
    render(<CasesPage />);
    await screen.findByText("Rivera Family Estate");
    // The count is readable as words. A viewer who cannot distinguish two badge colours gets the
    // same information as anyone else.
    expect(screen.getByText(/awaiting review/)).toBeInTheDocument();
  });
});

describe("the case file", () => {
  it("renders the workflow (positive control)", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    expect(await screen.findByRole("heading", { name: "Rivera Family Estate", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Death certificate")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Challenge window" })).toBeInTheDocument();
  });

  it("never renders an owner address or a storage path", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Rivera Family Estate", level: 1 });
    const text = document.body.textContent ?? "";
    expect(text).not.toContain(OWNER_ADDRESS);
    expect(text).not.toContain(STORAGE_PATH);
  });

  /**
   * ★ THE CENTRAL COPY RULE. `begin_challenge_window` accepts a `queued` notice, so the window can
   * legitimately be open while the email has not been sent. The screen must not smooth that into a
   * claim about a person. This fixture is exactly that case: window open, notice still queued.
   */
  it("says dispatch INITIATED, never that the owner was notified", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Rivera Family Estate", level: 1 });
    const text = (document.body.textContent ?? "").toLowerCase();

    expect(text).toContain("dispatch initiated");
    expect(text).not.toContain("owner was notified");
    expect(text).not.toContain("owner has been notified");
    expect(text).not.toContain("notice delivered");
    expect(text).not.toContain("email delivered");
  });

  it("states plainly that delivery cannot be observed", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Rivera Family Estate", level: 1 });
    expect(screen.getByText(/cannot observe whether anyone read/i)).toBeInTheDocument();
  });

  it("shows the window as facts and performs no urgency", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Challenge window" });
    const text = (document.body.textContent ?? "").toLowerCase();

    // Facts an operator needs…
    expect(text).toContain("release becomes possible");
    expect(text).toContain("elapsed");
    // …and none of the urgency vocabulary.
    for (const urgent of ["days remaining", "hurry", "expiring soon", "act now", "overdue", "% complete"]) {
      expect(text).not.toContain(urgent);
    }
    // No progress meter.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("invents no confidence score", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Verification level" });
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const invented of ["confidence", "score", "likelihood", "probability", "% match"]) {
      expect(text).not.toContain(invented);
    }
  });

  it("carries no estate content beyond the name that identifies the case", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Rivera Family Estate", level: 1 });
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const forbidden of ["net worth", "balance", "beneficiar", "asset", "portfolio", "$"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("never surfaces encrypted instructions", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Rivera Family Estate", level: 1 });
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const forbidden of ["encrypted instruction", "on_death", "on_executor_claim", "sealed instruction"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("the two-person rule, as the operator sees it", () => {
  it("tells the first reviewer they are ineligible, and does not offer to switch accounts", async () => {
    const rpc = await import("@/lib/cases/rpc");
    vi.mocked(rpc.getCase).mockResolvedValueOnce({
      ...caseFile,
      window: { ...caseFile.window, elapsed: true },
      release: { ...caseFile.release, viewer_is_reviewer_a: true }
    });

    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Release authorization" });

    // The sentence is bound to the disabled control…
    expect(screen.getByText(/you decided this case/i)).toBeInTheDocument();
    // …and the remedy is stated once, without repeating it.
    expect(screen.getByText(/different operator must sign in with their own account/i)).toBeInTheDocument();
    expect(screen.getByText(/shared account/i)).toBeInTheDocument();

    // ★ NO IDENTITY-SWITCHING AFFORDANCE. An operator switching accounts to satisfy a two-person
    // rule is the rule being defeated; a console that helped would be the tool that defeated it.
    for (const verb of [/switch account/i, /sign in as/i, /use another account/i, /continue as/i]) {
      expect(screen.queryByRole("button", { name: verb })).not.toBeInTheDocument();
    }

    // And the authorize control is disabled with its reason attached.
    const authorize = screen.getByRole("button", { name: /authorize the release/i });
    expect(authorize).toBeDisabled();
  });

  it("enables the authorize control for a second reviewer once the window has elapsed", async () => {
    const rpc = await import("@/lib/cases/rpc");
    vi.mocked(rpc.getCase).mockResolvedValueOnce({
      ...caseFile,
      window: { ...caseFile.window, elapsed: true },
      release: { ...caseFile.release, viewer_is_reviewer_a: false }
    });

    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Release authorization" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /authorize the release/i })).toBeEnabled();
    });
  });
});

describe("irreversible actions are distinguishable", () => {
  it("does not fire the release on a single click", async () => {
    const rpc = await import("@/lib/cases/rpc");
    vi.mocked(rpc.getCase).mockResolvedValueOnce({
      ...caseFile,
      window: { ...caseFile.window, elapsed: true }
    });

    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Release authorization" });

    const btn = screen.getByRole("button", { name: /authorize the release/i });
    btn.click();

    // The first click reveals the consequence; it does not call the RPC.
    await waitFor(() => {
      expect(screen.getByText(/this cannot be undone/i)).toBeInTheDocument();
    });
    expect(rpc.authorizeRelease).not.toHaveBeenCalled();
  });

  it("names the specific consequence rather than asking 'are you sure'", async () => {
    const rpc = await import("@/lib/cases/rpc");
    vi.mocked(rpc.getCase).mockResolvedValueOnce({
      ...caseFile,
      window: { ...caseFile.window, elapsed: true }
    });

    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Release authorization" });
    screen.getByRole("button", { name: /authorize the release/i }).click();

    await waitFor(() => {
      expect(screen.getByText(/disclosure cannot be undone/i)).toBeInTheDocument();
    });
    expect(document.body.textContent?.toLowerCase()).not.toContain("are you sure");
  });
});

describe("unavailable actions explain themselves on screen", () => {
  it("disables the release and shows the lifecycle reason", async () => {
    // The default fixture has an un-elapsed window.
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Release authorization" });

    expect(screen.getByRole("button", { name: /authorize the release/i })).toBeDisabled();
    expect(screen.getByText(/challenge window has not elapsed/i)).toBeInTheDocument();
  });
});
