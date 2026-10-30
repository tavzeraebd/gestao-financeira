import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type { RecurrenceView } from "@/modules/recurrences/types";

vi.mock("@/modules/recurrences/actions", () => ({
  pauseRecurrence: vi.fn(),
  resumeRecurrence: vi.fn(),
  endRecurrence: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/recorrencias",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RecurrenceCard } from "./recurrence-card";

afterEach(cleanup);

const TODAY = "2026-10-30" as ISODate;

function view(over: Partial<RecurrenceView> = {}): RecurrenceView {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "pagar",
    description: "Empréstimo consignado",
    amount: asCents(50000),
    frequency: "monthly",
    intervalCount: 1,
    startDate: "2026-01-05" as ISODate,
    endDate: "2027-01-05" as ISODate,
    label: "Todo mês, dia 5",
    nextOccurrence: "2026-11-05" as ISODate,
    payrollDeduction: false,
    state: "active",
    attention: null,
    account: { id: "a", name: "Conta corrente" },
    category: { id: "c", name: "Empréstimos", color: "chart-1", icon: "house" },
    assignedMember: null,
    canManage: true,
    ...over,
  };
}

describe("RecurrenceCard: desconto em folha", () => {
  it("série comum não tem selo e mantém a ação Ocorrências", () => {
    render(<RecurrenceCard recurrence={view()} today={TODAY} />);
    expect(screen.queryByText("Desconto em folha")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Ver ocorrências de Empréstimo consignado",
      }),
    ).toBeInTheDocument();
  });

  it("série em folha mostra o selo com texto, explica e esconde Ocorrências", () => {
    render(
      <RecurrenceCard
        recurrence={view({ payrollDeduction: true })}
        today={TODAY}
      />,
    );
    expect(screen.getByText("Desconto em folha")).toBeInTheDocument();
    expect(screen.getByText(/não gera contas a pagar/)).toBeInTheDocument();
    expect(screen.getByText("05/11/2026")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Ver ocorrências/ }),
    ).not.toBeInTheDocument();
    // As demais ações só com ícone seguem com aria-label.
    expect(
      screen.getByRole("link", { name: /Editar série/ }),
    ).toBeInTheDocument();
  });
});
