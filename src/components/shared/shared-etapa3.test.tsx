import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import {
  CategoryIcon,
  CATEGORY_ICON_COMPONENTS,
} from "@/components/shared/category-icon";
import { DatePicker } from "@/components/shared/date-picker";
import { FiltersPanel } from "@/components/shared/filters-panel";
import { Money } from "@/components/shared/money";
import { MoneyInput } from "@/components/shared/money-input";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { SearchInput } from "@/components/shared/search-input";
import { SegmentedControl } from "@/components/shared/segmented-control";
import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import { CATEGORY_ICONS } from "@/modules/categories/constants";

let mobile = false;

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: mobile && query.includes("max-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  mobile = false;
});

function MoneyHarness({ allowNegative }: { allowNegative?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <MoneyInput
      aria-label="Valor"
      value={value}
      onChange={setValue}
      allowNegative={allowNegative}
    />
  );
}

describe("MoneyInput", () => {
  it("reformata 1234,5 para 1.234,50 no blur", async () => {
    const user = userEvent.setup();
    render(<MoneyHarness />);
    const input = screen.getByRole("textbox", { name: "Valor" });
    await user.type(input, "1234,5");
    await user.tab();
    expect(input).toHaveValue("1.234,50");
  });

  it("mantém o texto inválido no blur", async () => {
    const user = userEvent.setup();
    render(<MoneyHarness />);
    const input = screen.getByRole("textbox", { name: "Valor" });
    await user.type(input, "12,345");
    await user.tab();
    expect(input).toHaveValue("12,345");
  });

  it("usa teclado decimal, prefixo R$ oculto e números tabulares", () => {
    render(<MoneyHarness />);
    const input = screen.getByRole("textbox", { name: "Valor" });
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveClass("tabular-nums");
    expect(screen.getByText("R$")).toHaveAttribute("aria-hidden", "true");
  });

  it("aceita valor negativo só com allowNegative", async () => {
    const user = userEvent.setup();
    render(<MoneyHarness allowNegative />);
    const input = screen.getByRole("textbox", { name: "Valor" });
    await user.type(input, "-50");
    await user.tab();
    expect(input).toHaveValue("-50,00");
  });

  it("propaga aria-invalid e disabled", () => {
    render(
      <MoneyInput
        aria-label="Valor"
        value=""
        onChange={() => {}}
        aria-invalid
        disabled
      />,
    );
    const input = screen.getByRole("textbox", { name: "Valor" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeDisabled();
  });
});

describe("Money", () => {
  it("mostra o sinal em texto", () => {
    render(
      <>
        <Money cents={asCents(12345)} direction="in" />
        <Money cents={asCents(12345)} direction="out" />
        <Money cents={asCents(12345)} />
      </>,
    );
    expect(screen.getByText(/^\+/)).toHaveTextContent(/^\+\s*R\$\s*123,45$/);
    expect(screen.getByText(/^−/)).toHaveTextContent(/^−\s*R\$\s*123,45$/);
    const neutral = screen.getAllByText(/R\$\s*123,45/).at(-1)!;
    expect(neutral.textContent).not.toMatch(/^[+−-]/);
  });

  it("usa os tokens de receita e despesa", () => {
    render(
      <>
        <Money cents={asCents(100)} direction="in" />
        <Money cents={asCents(100)} direction="out" />
      </>,
    );
    expect(screen.getByText(/^\+/)).toHaveClass("text-income");
    expect(screen.getByText(/^−/)).toHaveClass("text-expense");
  });
});

describe.each([
  ["relógio em 25/10/2026", "2026-10-25T15:00:00Z"],
  ["relógio em 2030, 23:59 em São Paulo", "2030-01-15T02:59:59Z"],
  ["relógio logo após a meia-noite em São Paulo", "2026-10-24T03:00:01Z"],
])("DatePicker com %s", (_label, now) => {
  const today = "2026-10-23" as ISODate;

  // Só `Date` é simulado: o `today` recebido manda, não o relógio do navegador.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra Hoje, Ontem e dd/mm/aaaa", () => {
    const { rerender } = render(
      <DatePicker
        id="d"
        value="2026-10-23"
        onChange={() => {}}
        today={today}
      />,
    );
    expect(screen.getByRole("button", { name: "Hoje" })).toBeInTheDocument();
    rerender(
      <DatePicker
        id="d"
        value="2026-10-22"
        onChange={() => {}}
        today={today}
      />,
    );
    expect(screen.getByRole("button", { name: "Ontem" })).toBeInTheDocument();
    rerender(
      <DatePicker
        id="d"
        value="2026-03-05"
        onChange={() => {}}
        today={today}
      />,
    );
    expect(
      screen.getByRole("button", { name: "05/03/2026" }),
    ).toBeInTheDocument();
  });

  it("respeita max: dias depois do limite ficam desabilitados", async () => {
    const user = userEvent.setup();
    render(
      <DatePicker
        id="d"
        value="2026-10-23"
        onChange={() => {}}
        today={today}
        max={today}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Hoje" }));
    const dialog = await screen.findByRole("dialog");
    const grid = within(dialog).getByRole("grid");
    const day24 = within(grid).getByRole("button", { name: /24/ });
    const day23 = within(grid).getByRole("button", { name: /23/ });
    expect(day24).toBeDisabled();
    expect(day23).toBeEnabled();
  });

  it("funciona por teclado: abre com Enter, alcança a grade e escolhe com atalho", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DatePicker
        id="d"
        value="2026-10-23"
        onChange={onChange}
        today={today}
        max={today}
      />,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("grid")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /^Hoje, .*selecionado$/ }),
    ).toBeInTheDocument();
    const ontem = within(dialog).getByRole("button", { name: "Ontem" });
    ontem.focus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("2026-10-22");
  });

  it("ao abrir, o foco vai para o dia selecionado e Esc devolve o foco ao gatilho", async () => {
    const user = userEvent.setup();
    render(
      <DatePicker
        id="d"
        value="2026-10-23"
        onChange={() => {}}
        today={today}
        max={today}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Hoje" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-day", "23/10/2026"),
    );
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("atalho Ontem escolhe a data de ontem", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DatePicker
        id="d"
        value="2026-10-01"
        onChange={onChange}
        today={today}
      />,
    );
    await user.click(screen.getByRole("button", { name: "01/10/2026" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Ontem" }));
    expect(onChange).toHaveBeenCalledWith("2026-10-22");
  });

  it("propaga aria-invalid, aria-describedby e disabled", () => {
    render(
      <DatePicker
        id="d"
        value=""
        onChange={() => {}}
        today={today}
        aria-invalid
        aria-describedby="erro"
        disabled
      />,
    );
    const trigger = screen.getByRole("button", { name: "Selecionar data" });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAttribute("aria-describedby", "erro");
    expect(trigger).toBeDisabled();
  });
});

describe("SegmentedControl", () => {
  type Kind = "expense" | "income" | "transfer";
  const options = [
    {
      value: "expense",
      label: "Despesa",
      icon: ArrowDownIcon,
      tone: "expense",
    },
    { value: "income", label: "Receita", icon: ArrowUpIcon, tone: "income" },
    { value: "transfer", label: "Transferência" },
  ] as const;

  function Harness({ disabled }: { disabled?: boolean }) {
    const [value, setValue] = useState<Kind>("expense");
    return (
      <SegmentedControl<Kind>
        aria-label="Tipo de lançamento"
        value={value}
        onValueChange={setValue}
        options={[...options]}
        disabled={disabled}
      />
    );
  }

  it("tem semântica de radio e responde às setas", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(
      screen.getByRole("radiogroup", { name: "Tipo de lançamento" }),
    ).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Despesa" })).toBeChecked();
    await user.tab();
    expect(screen.getByRole("radio", { name: "Despesa" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Receita" })).toBeChecked();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Transferência" })).toBeChecked();
  });

  it("fica desabilitado", () => {
    render(<Harness disabled />);
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-disabled", "true");
    }
  });
});

describe("ResponsiveList", () => {
  const items = [
    { id: "1", name: "Mercado" },
    { id: "2", name: "Aluguel" },
  ];

  it("renderiza tabela com caption e cartões", () => {
    render(
      <ResponsiveList
        items={items}
        getKey={(i) => i.id}
        caption="Lançamentos"
        columns={[{ id: "name", header: "Descrição", cell: (i) => i.name }]}
        renderCard={(i) => <span>Cartão {i.name}</span>}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("Lançamentos")).toHaveClass("sr-only");
    expect(
      within(table).getByRole("columnheader", { name: "Descrição" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("cell", { name: "Mercado" }),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Lançamentos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Cartão Aluguel")).toBeInTheDocument();
  });

  it("esconde cada versão no ponto de corte certo", () => {
    const { container } = render(
      <ResponsiveList
        items={items}
        getKey={(i) => i.id}
        caption="Lançamentos"
        columns={[{ id: "name", header: "Descrição", cell: (i) => i.name }]}
        renderCard={(i) => <span>{i.name}</span>}
      />,
    );
    expect(container.querySelector("table")?.closest(".hidden")).toHaveClass(
      "md:block",
    );
    expect(container.querySelector("ul")).toHaveClass("md:hidden");
  });
});

describe("PaginationNav", () => {
  const href = (p: number) => `/transacoes?pagina=${p}`;

  it("marca a página atual com aria-current", () => {
    render(<PaginationNav page={3} pageCount={10} hrefForPage={href} />);
    const nav = screen.getByRole("navigation", { name: "Paginação" });
    const current = within(nav).getByRole("link", { name: "Página 3" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("link", { name: "Página 2" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      within(nav).getAllByRole("link", { name: /^Página \d+$/ }),
    ).toHaveLength(5);
    expect(within(nav).getByRole("link", { name: "Próxima" })).toHaveAttribute(
      "href",
      href(4),
    );
    expect(within(nav).getByRole("link", { name: "Anterior" })).toHaveAttribute(
      "href",
      href(2),
    );
    expect(within(nav).getByText("Página 3 de 10")).toBeInTheDocument();
  });

  it("desabilita Anterior na primeira página e Próxima na última", () => {
    const { rerender } = render(
      <PaginationNav page={1} pageCount={3} hrefForPage={href} />,
    );
    expect(screen.queryByRole("link", { name: "Anterior" })).toBeNull();
    expect(screen.getByText("Anterior").closest("span")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    rerender(<PaginationNav page={3} pageCount={3} hrefForPage={href} />);
    expect(screen.queryByRole("link", { name: "Próxima" })).toBeNull();
  });

  it("não renderiza com uma página só", () => {
    const { container } = render(
      <PaginationNav page={1} pageCount={1} hrefForPage={href} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CategoryIcon", () => {
  it("é decorativo e usa os tokens chart", () => {
    const { container } = render(<CategoryIcon icon="house" color="chart-3" />);
    const box = container.firstElementChild;
    expect(box).toHaveAttribute("aria-hidden", "true");
    expect(box).toHaveClass("bg-chart-3/15", "text-chart-3");
  });

  it("tem componente para todos os nomes da allowlist", () => {
    for (const name of CATEGORY_ICONS) {
      expect(CATEGORY_ICON_COMPONENTS[name]).toBeDefined();
    }
    expect(Object.keys(CATEGORY_ICON_COMPONENTS)).toHaveLength(30);
  });
});

describe("SearchInput", () => {
  it("mostra Limpar busca só com texto e chama onClear", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { rerender } = render(
      <SearchInput
        aria-label="Buscar"
        value=""
        onChange={() => {}}
        onClear={onClear}
      />,
    );
    expect(
      screen.getByRole("searchbox", { name: "Buscar" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpar busca" })).toBeNull();
    rerender(
      <SearchInput
        aria-label="Buscar"
        value="mer"
        onChange={() => {}}
        onClear={onClear}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe("FiltersPanel", () => {
  it("desktop: mostra os filtros e Limpar filtros quando há ativos", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <FiltersPanel activeCount={2} onClear={onClear}>
        <label>
          Conta <input />
        </label>
      </FiltersPanel>,
    );
    expect(screen.getByLabelText("Conta")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    expect(onClear).toHaveBeenCalled();
  });

  it("desktop: sem filtros ativos não mostra Limpar filtros", () => {
    render(
      <FiltersPanel activeCount={0} onClear={() => {}}>
        <span>x</span>
      </FiltersPanel>,
    );
    expect(screen.queryByRole("button", { name: /Limpar filtros/ })).toBeNull();
  });

  it("celular: botão Filtros (n) abre a folha com Limpar e Ver resultados", async () => {
    mobile = true;
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <FiltersPanel activeCount={3} onClear={onClear}>
        <label>
          Conta <input />
        </label>
      </FiltersPanel>,
    );
    expect(screen.queryByLabelText("Conta")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Filtros (3)" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Conta")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Limpar" }));
    expect(onClear).toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Ver resultados" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
