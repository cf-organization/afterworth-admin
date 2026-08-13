import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Each test renders into a fresh DOM. Without this a landmark-count assertion would see the
// previous test's tree and pass or fail for reasons that have nothing to do with the component
// under test — the accessibility-audit equivalent of a stateful matcher.
afterEach(cleanup);
