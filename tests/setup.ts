import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
