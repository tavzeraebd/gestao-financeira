import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/auth/actions", () => ({ signOut: vi.fn() }));

import { UserMenu, userMenuLabel } from "./user-menu";

afterEach(cleanup);

describe("UserMenu", () => {
  it("o nome acessível contém o texto visível (iniciais) - WCAG 2.5.3", () => {
    render(
      <UserMenu displayName="João Silva" email="joao@x.com" avatarUrl={null} />,
    );
    const trigger = screen.getByRole("button");
    const visible = (trigger.textContent ?? "").trim();
    expect(visible).toBe("JS");
    const name = trigger.getAttribute("aria-label") ?? "";
    expect(name.toLowerCase()).toContain(visible.toLowerCase());
    expect(name).toContain("João Silva");
  });

  it("monta o rótulo com iniciais de nome único", () => {
    expect(userMenuLabel("Maria")).toBe("M, menu de Maria");
  });
});
