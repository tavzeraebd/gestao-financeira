import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

describe("Tabs", () => {
  // Contraste (WCAG 1.4.3): `text-foreground/60` sobre `bg-muted` media 4,48:1 no tema claro.
  it("aba inativa usa muted-foreground (nunca foreground com opacidade)", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Tipo">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const inativa = screen.getByRole("tab", { name: "B" });
    expect(inativa.className).toContain("text-muted-foreground");
    expect(inativa.className).not.toMatch(/text-foreground\/\d+/);
  });
});
