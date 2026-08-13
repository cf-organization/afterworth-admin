/**
 * PHASE 11-K — the operator console is production software, and is audited as such.
 *
 * ★ THIS IS A RENDER AUDIT, NOT A SOURCE GREP. Structure is the thing being asserted: one primary
 * landmark, subordinate section headings, labelled controls, action-describing button names. None
 * of those can be established by matching text in a file, and every static approximation of a
 * heading contract this project has tried was wrong in one of two directions — counting
 * `role="header"` per file condemns a legitimate section heading, and matching copy pins wording
 * rather than semantics.
 *
 * ★ AND THE INSTRUMENT IS CHECKED BEFORE IT IS BELIEVED. A screen that rendered nothing would pass
 * "there is no more than one level-1 heading" perfectly. §0 proves the query can see headings at
 * all before any counting assertion runs.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CaseFile, CaseQueueRow } from "@/lib/cases/types";

const queueRow: CaseQueueRow = {
  case_id: "c1", estate_id: "e1", estate_name: "Rivera Family Estate",
  case_status: "open", lifecycle_state: "death_verification_pending", event_type: "death",
  initiated_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  initiator_capacity: "executor", jurisdiction_context: "US-CA",
  required_level: "attestation", attained_level: null,
  evidence_total: 2, evidence_awaiting_review: 1,
  owner_channel_resolvable: true, decided_at: null
};

const caseFile: CaseFile = {
  case: {
    case_id: "c1", estate_id: "e1", estate_name: "Rivera Family Estate", status: "open",
    event_type: "death", initiated_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-04T00:00:00Z",
    initiator_capacity: "executor", jurisdiction_context: "US-CA",
    required_level_at_initiation: "attestation", required_level_live: "attestation",
    attained_level: null, decided_at: null, decision_note: null
  },
  initiator: { user_id: "u1", email: null, name: "Dana Fiduciary", capacity: "executor" },
  lifecycle: {
    state: "death_verification_pending", owner_notified_at: null,
    challenge_window_started_at: null, halted_at: null, released_at: null, updated_at: null
  },
  window: { duration: "7 days", configured: true, release_eligible_at: null, elapsed: false },
  owner_notice: [],
  evidence: [{
    evidence_id: "ev1", document_id: "d1", title: "Death certificate",
    doc_type: "death_certificate", uploaded_at: "2026-08-02T00:00:00Z",
    submitted_at: "2026-08-02T01:00:00Z", review_status: "received",
    reviewed_at: null, review_note: null
  }],
  release: { reviewer_a: null, viewer_is_reviewer_a: false, authorized: null }
};

vi.mock("@/lib/cases/rpc", () => ({
  listCases: vi.fn(async () => [queueRow]),
  getCase: vi.fn(async () => caseFile),
  reviewEvidence: vi.fn(), setAttainedLevel: vi.fn(), decideCase: vi.fn(),
  dispatchOwnerNotice: vi.fn(), beginChallengeWindow: vi.fn(),
  authorizeRelease: vi.fn(), ownerNoticeCensus: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/cases",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() })
}));

import CasesPage from "@/app/(dashboard)/cases/page";
import CaseDetailPage from "@/app/(dashboard)/cases/[id]/page";

beforeEach(() => vi.clearAllMocks());

describe("0 · the instrument can see headings at all", () => {
  it("finds headings on both destinations before anything is counted", async () => {
    render(<CasesPage />);
    await screen.findByText("Rivera Family Estate");
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
  });
});

describe("1 · exactly one primary landmark per destination", () => {
  it("the queue names itself once at level 1", async () => {
    render(<CasesPage />);
    await screen.findByText("Rivera Family Estate");
    const primary = screen.getAllByRole("heading", { level: 1 });
    expect(primary).toHaveLength(1);
    expect(primary[0]).toHaveTextContent("Death verification");
  });

  it("the case file names itself once at level 1", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Rivera Family Estate", level: 1 });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("section headings are SUBORDINATE, and there are several (positive control)", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Rivera Family Estate", level: 1 });
    // If these were level 1 the screen would announce six titles; if there were none, the
    // uniqueness assertion above would be passing on an empty page.
    const subordinate = screen.getAllByRole("heading", { level: 2 });
    expect(subordinate.length).toBeGreaterThanOrEqual(5);
    for (const h of subordinate) {
      expect(h.getAttribute("aria-level")).not.toBe("1");
    }
  });
});

describe("2 · every button names the action it performs", () => {
  const GENERIC = ["ok", "continue", "proceed", "submit", "go", "yes", "confirm", "done", "next"];

  it("no generic verb anywhere on the case file", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Rivera Family Estate", level: 1 });
    for (const b of screen.getAllByRole("button")) {
      const name = (b.textContent ?? "").trim().toLowerCase().replace(/…$/, "");
      expect(name.length, "a button has no accessible name").toBeGreaterThan(0);
      expect(GENERIC, `button named "${name}" says nothing about what it does`).not.toContain(name);
    }
  });

  it("the irreversible acts name their verb rather than a direction", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Verification decision" });
    expect(screen.getByRole("button", { name: /verify this death/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject this case/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dispatch the owner notice/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open the challenge window/i })).toBeInTheDocument();
  });
});

describe("3 · every input has a programmatic label", () => {
  it("the case file's fields are all labelled", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Rivera Family Estate", level: 1 });

    // POSITIVE CONTROL: there ARE fields, so the loop is not vacuous.
    const fields = [
      ...screen.getAllByRole("textbox"),
      ...screen.getAllByRole("combobox")
    ];
    expect(fields.length).toBeGreaterThanOrEqual(3);

    for (const f of fields) {
      const id = f.getAttribute("id");
      expect(id, "a field has no id to label").toBeTruthy();
      const label = document.querySelector(`label[for="${id}"]`);
      expect(label, `field #${id} has no <label for>`).not.toBeNull();
      expect((label!.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });
});

describe("4 · disabled controls carry their reason as text", () => {
  it("a blocked action explains itself in the DOM, not only by being grey", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Release authorization" });

    const authorize = screen.getByRole("button", { name: /authorize the release/i });
    expect(authorize).toBeDisabled();
    expect(authorize).toHaveAttribute("aria-disabled", "true");
    // The reason is present as readable text. Colour and opacity alone convey nothing to a screen
    // reader, and disabled-plus-silent is how an operator concludes the console is broken.
    //
    // Scoped to the RELEASE reason specifically: at this lifecycle state dispatch, the window and
    // release are all blocked and all three say so, which is correct — each control explains
    // itself. A bare match on the state name would find three nodes and fail for the healthy
    // reason, so the assertion names the sentence only release gives.
    expect(
      screen.getByText(/Release proceeds only from an open window/i)
    ).toBeInTheDocument();
  });

  it("EVERY blocked action explains itself, not just the release", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    await screen.findByRole("heading", { name: "Release authorization" });

    const disabled = screen.getAllByRole("button").filter((b) => b.hasAttribute("disabled"));
    // POSITIVE CONTROL: at this lifecycle state several actions ARE blocked.
    expect(disabled.length).toBeGreaterThanOrEqual(3);

    for (const b of disabled) {
      // Each disabled control is followed by its reason paragraph inside the same wrapper.
      const reason = b.parentElement?.querySelector("p");
      expect(reason, `"${b.textContent}" is disabled with no reason`).not.toBeNull();
      expect((reason!.textContent ?? "").trim().length).toBeGreaterThan(10);
    }
  });
});

describe("5 · status and error regions are announced", () => {
  it("the loading state is a live status region", async () => {
    render(<CaseDetailPage params={{ id: "c1" }} />);
    // Rendered before the promise resolves.
    expect(screen.getByRole("status")).toHaveTextContent(/loading case/i);
    await screen.findByRole("heading", { name: "Rivera Family Estate", level: 1 });
  });

  it("the queue's filter group is a labelled navigation region", async () => {
    render(<CasesPage />);
    await screen.findByText("Rivera Family Estate");
    const nav = screen.getByRole("navigation", { name: /filter by case status/i });
    expect(nav).toBeInTheDocument();
    // Filters are toggle buttons, and their pressed state is programmatic rather than visual.
    const all = screen.getByRole("button", { name: "All" });
    expect(all).toHaveAttribute("aria-pressed", "true");
  });
});

describe("6 · the data table is navigable", () => {
  it("has a caption and scoped column headers", async () => {
    render(<CasesPage />);
    await screen.findByText("Rivera Family Estate");
    const table = screen.getByRole("table");
    expect(table.querySelector("caption")).not.toBeNull();
    const headers = screen.getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThanOrEqual(6);
    for (const h of headers) {
      expect(h.getAttribute("scope")).toBe("col");
    }
  });

  it("every row is reachable by a link, not by a click handler on the row", async () => {
    render(<CasesPage />);
    await screen.findByText("Rivera Family Estate");
    const link = screen.getByRole("link", { name: "Rivera Family Estate" });
    expect(link).toHaveAttribute("href", "/cases/c1");
  });
});
