import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { AppShell, SurfaceHeader } from "@/components/app-shell";
import { SettingsPanel } from "@/components/settings-panel";
import { SettingsProvider } from "@/components/settings-context";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigationState.pathname }));

describe("responsive and accessible shell behavior", () => {
  it("focuses and announces the new surface heading after navigation", async () => {
    const view = render(<AppShell><SurfaceHeader eyebrow="Workspace" title="New enhancement" description="Start here." /></AppShell>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "New enhancement" })).toHaveFocus());
    navigationState.pathname = "/settings";
    view.rerender(<AppShell><SurfaceHeader eyebrow="Workspace" title="Settings" description="Tune the workspace." /></AppShell>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toHaveFocus());
    expect(screen.getByText("Current surface: Settings")).toBeInTheDocument();
  });

  it("uses the main landmark when a surface has no heading", async () => {
    render(<AppShell><p>Loading surface</p></AppShell>);
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });

  it("closes the mobile Sheet with Escape and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<AppShell><SurfaceHeader eyebrow="Workspace" title="New enhancement" description="Start here." /></AppShell>);
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Mobile navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close navigation" })).toHaveClass("min-h-11");
    screen.getByRole("dialog", { name: "Mobile navigation" }).focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mobile navigation" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps responsive layout contracts and settings controls touch-sized", () => {
    const view = render(<SettingsProvider><SettingsPanel /></SettingsProvider>);
    const shell = render(<AppShell><SurfaceHeader eyebrow="Workspace" title="New enhancement" description="Start here." /></AppShell>);
    expect(shell.getByRole("complementary", { name: "Application sidebar" })).toHaveClass("lg:flex");
    expect(shell.getByRole("button", { name: "Open navigation" })).toHaveClass("lg:hidden");
    expect(view.container.firstElementChild).toHaveClass("md:grid-cols-2");
    expect(screen.getByRole("switch", { name: "Reduced motion" })).toHaveClass("h-11");
    const styles = readFileSync("app/globals.css", "utf8");
    expect(styles).toContain('[data-reduced-motion="true"]');
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });
});
