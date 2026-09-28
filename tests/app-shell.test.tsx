import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { AppShell } from "@/components/app-shell";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

describe("AppShell", () => {
  it("renders the local-first navigation shell", () => {
    const view = render(<AppShell><h1>New enhancement</h1></AppShell>);

    expect(view.getAllByText("New enhancement").length).toBeGreaterThan(0);
    expect(view.getByRole("link", { name: /history/i })).toBeInTheDocument();
    expect(view.getByRole("link", { name: /settings/i })).toBeInTheDocument();
    expect(view.getAllByText("On this device").length).toBeGreaterThan(0);
    expect(view.getAllByRole("button", { name: /on this device/i }).length).toBeGreaterThan(0);
    expect(view.queryByText(/upload|cloud sync|remote processing/i)).not.toBeInTheDocument();
  });

  it("keeps an accessible active-job region in the shell", () => {
    const view = render(<AppShell><h1>New enhancement</h1></AppShell>);

    expect(view.getByRole("region", { name: /active jobs/i })).toBeInTheDocument();
    expect(view.getByText(/no active jobs/i)).toBeInTheDocument();
  });

  it("renders an available active job as a navigable summary", () => {
    const view = render(
      <AppShell activeJob={{ href: "/processing/job-1", label: "Interview recording", status: "Enhancing" }}>
        <h1>New enhancement</h1>
      </AppShell>,
    );

    expect(view.getByRole("link", { name: /interview recording/i })).toHaveAttribute("href", "/processing/job-1");
    expect(view.getByText("Enhancing")).toBeInTheDocument();
  });

  it("marks destination navigation as selected when the route changes", () => {
    navigationState.pathname = "/history";
    const view = render(<AppShell><h1>History</h1></AppShell>);

    expect(view.getByRole("link", { name: /history/i })).toHaveAttribute("aria-current", "page");
    expect(view.getByRole("link", { name: /new enhancement/i })).not.toHaveAttribute("aria-current", "page");
  });

  it("keeps the compact navigation trigger reachable for small viewports", () => {
    navigationState.pathname = "/";
    const view = render(<AppShell><h1>New enhancement</h1></AppShell>);

    expect(view.getByRole("button", { name: /open navigation/i })).toBeInTheDocument();
  });

  it("defines a reduced-motion fallback for shell feedback", () => {
    const styles = readFileSync("app/globals.css", "utf8");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).toContain("transition-duration: 0.01ms");
  });
});
