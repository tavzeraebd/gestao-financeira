import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/inicio" }));

import { SidebarProvider } from "@/components/ui/sidebar";

import { AppSidebar } from "./app-sidebar";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width") ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    value: 1280,
    configurable: true,
  });
});
afterEach(cleanup);

describe("AppSidebar - menu", () => {
  it("itens têm espaçamento entre si e altura fixa (fundos não se sobrepõem)", () => {
    mockMatchMedia(true);
    render(
      <SidebarProvider>
        <AppSidebar familyName="Silva" />
      </SidebarProvider>,
    );
    const menu = screen.getByRole("link", { name: "Início" }).closest("ul");
    expect(menu?.className).toContain("gap-1");
    const link = screen.getByRole("link", { name: "Início" });
    expect(link.className).toMatch(/\bh-10\b/);
    expect(link.className).not.toMatch(/-m[xytblr]-|scale|translate/);
  });

  it("recolhido: ícone centralizado, texto só para leitor de tela, aria-label mantido", () => {
    mockMatchMedia(false);
    render(
      <SidebarProvider>
        <AppSidebar familyName="Silva" />
      </SidebarProvider>,
    );
    const link = screen.getByRole("link", { name: "Início" });
    expect(link.getAttribute("aria-label")).toBe("Início");
    expect(link.className).toContain(
      "group-data-[collapsible=icon]:justify-center",
    );
    expect(link.className).toContain("group-data-[collapsible=icon]:size-12!");
    expect(link.className).toContain("group-data-[collapsible=icon]:p-0!");
    const texto = link.querySelector("span");
    expect(texto?.className).toContain("group-data-[collapsible=icon]:sr-only");
  });

  it("recolhido: ícone de 24px e grupo com padding horizontal de 12px (botão de 48px cabe na coluna de 72px)", () => {
    mockMatchMedia(false);
    render(
      <SidebarProvider>
        <AppSidebar familyName="Silva" />
      </SidebarProvider>,
    );
    const link = screen.getByRole("link", { name: "Início" });
    const icone = link.querySelector("svg");
    expect(icone?.getAttribute("class")).toContain(
      "group-data-[collapsible=icon]:size-6",
    );
    const grupo = link.closest("[data-slot='sidebar-group']");
    expect(grupo?.className).toContain("group-data-[collapsible=icon]:px-3");
  });
});
