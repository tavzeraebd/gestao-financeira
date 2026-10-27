import { describe, expect, it } from "vitest";
import {
  addCents,
  allocate,
  asCents,
  formatBRL,
  fromDbNumeric,
  MAX_CENTS,
  negCents,
  parseBRL,
  percentOf,
  subCents,
  sumCents,
  toBRLInput,
  toDbNumeric,
  type Cents,
} from "@/lib/money";

const c = (n: number) => asCents(n);
const nbsp = " ";

describe("asCents", () => {
  it("aceita inteiros na faixa e normaliza -0", () => {
    expect(asCents(123456)).toBe(123456);
    expect(Object.is(asCents(-0), 0)).toBe(true);
    expect(asCents(MAX_CENTS)).toBe(MAX_CENTS);
    expect(asCents(-MAX_CENTS)).toBe(-MAX_CENTS);
  });

  it.each([1.5, Number.NaN, Infinity, MAX_CENTS + 1, -MAX_CENTS - 1, 2 ** 53])(
    "lança para %s",
    (n) => {
      expect(() => asCents(n)).toThrow(RangeError);
    },
  );
});

describe("parseBRL: tabela do financial-definitions §1", () => {
  it.each([
    ["1.234,56", 123456],
    ["R$ 1.234,56", 123456],
    ["R$1.234,56", 123456],
    ["1234,56", 123456],
    ["1.234", 123400],
    ["12,5", 1250],
    ["0,01", 1],
    ["1.234.567,89", 123456789],
    ["0", 0],
    ["0,00", 0],
    ["007,50", 750],
    [`R$${nbsp}1.234,56`, 123456],
    ["  12  ", 1200],
    ["99.999.999,99", MAX_CENTS],
  ])("%j -> %i centavos", (input, cents) => {
    expect(parseBRL(input)).toEqual({ ok: true, value: cents });
  });

  it.each([
    ["1,234.56"],
    ["1.234.56"],
    ["1.5"],
    ["12.34"],
    ["1,2,3"],
    ["abc"],
    ["1.2345"],
    ["1234.567,89"],
    ["12,"],
    [",5"],
    ["+5"],
    ["1e3"],
  ])("%j -> INVALID_FORMAT", (input) => {
    expect(parseBRL(input)).toEqual({ ok: false, error: "INVALID_FORMAT" });
  });

  it.each([["10,999"], ["1.234,567"], ["0,001"]])(
    "%j -> TOO_MANY_DECIMALS (sem arredondar)",
    (input) => {
      expect(parseBRL(input)).toEqual({
        ok: false,
        error: "TOO_MANY_DECIMALS",
      });
    },
  );

  it.each([["-5,00"], ["-0,01"], ["R$ -5,00"], ["-R$ 5,00"]])(
    "%j -> NEGATIVE por padrão",
    (input) => {
      expect(parseBRL(input)).toEqual({ ok: false, error: "NEGATIVE" });
    },
  );

  it.each([[""], ["   "], [nbsp], ["R$"], ["R$ "]])("%j -> EMPTY", (input) => {
    expect(parseBRL(input)).toEqual({ ok: false, error: "EMPTY" });
  });

  it.each([["100.000.000,00"], ["99.999.999,991"], ["999999999"]])(
    "%j -> fora da faixa",
    (input) => {
      const result = parseBRL(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(["OUT_OF_RANGE", "TOO_MANY_DECIMALS"]).toContain(result.error);
      }
    },
  );

  it("acima do limite sem decimais -> OUT_OF_RANGE", () => {
    expect(parseBRL("100.000.000")).toEqual({
      ok: false,
      error: "OUT_OF_RANGE",
    });
    expect(parseBRL("100.000.000,00")).toEqual({
      ok: false,
      error: "OUT_OF_RANGE",
    });
  });

  it("nunca arredonda: 10,999 não vira 11,00", () => {
    expect(parseBRL("10,999").ok).toBe(false);
  });
});

describe("parseBRL: allowNegative", () => {
  const opts = { allowNegative: true };

  it.each([
    ["-1.234,56", -123456],
    ["-0,01", -1],
    ["R$ -5,00", -500],
    ["-R$ 5,00", -500],
    ["- 5,00", -500],
    ["5,00", 500],
    ["-0", 0],
  ])("%j -> %i", (input, cents) => {
    expect(parseBRL(input, opts)).toEqual({ ok: true, value: cents });
  });

  it.each([["--5"], ["-1,234.56"], ["5-"], ["-R$-5"]])(
    "%j continua inválido",
    (input) => {
      expect(parseBRL(input, opts)).toEqual({
        ok: false,
        error: "INVALID_FORMAT",
      });
    },
  );

  it("sinal sozinho é EMPTY e o limite vale para negativos", () => {
    expect(parseBRL("-", opts)).toEqual({ ok: false, error: "EMPTY" });
    expect(parseBRL("-100.000.000", opts)).toEqual({
      ok: false,
      error: "OUT_OF_RANGE",
    });
    expect(parseBRL("-99.999.999,99", opts)).toEqual({
      ok: true,
      value: -MAX_CENTS,
    });
  });
});

describe("formatBRL e toBRLInput", () => {
  const intl = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  it("formata como o Intl pt-BR", () => {
    expect(formatBRL(c(123456))).toBe(intl.format(1234.56));
    expect(formatBRL(c(123456))).toBe(`R$${nbsp}1.234,56`);
    expect(formatBRL(c(1))).toBe(`R$${nbsp}0,01`);
    expect(formatBRL(c(-50))).toBe(intl.format(-0.5));
    expect(formatBRL(c(0))).toBe(`R$${nbsp}0,00`);
  });

  it("signDisplay", () => {
    expect(formatBRL(c(500), { signDisplay: "always" })).toBe(`+R$${nbsp}5,00`);
    expect(formatBRL(c(0), { signDisplay: "always" })).toBe(`+R$${nbsp}0,00`);
    expect(formatBRL(c(0), { signDisplay: "exceptZero" })).toBe(
      `R$${nbsp}0,00`,
    );
    expect(formatBRL(c(500), { signDisplay: "exceptZero" })).toBe(
      `+R$${nbsp}5,00`,
    );
    expect(formatBRL(c(500), { signDisplay: "auto" })).toBe(`R$${nbsp}5,00`);
  });

  it("formata o maior valor sem perder centavos", () => {
    expect(formatBRL(c(MAX_CENTS))).toBe(`R$${nbsp}99.999.999,99`);
  });

  it.each([
    [123456, "1.234,56"],
    [0, "0,00"],
    [1, "0,01"],
    [100, "1,00"],
    [99999, "999,99"],
    [100000, "1.000,00"],
    [123456789, "1.234.567,89"],
    [-123456, "-1.234,56"],
    [-5, "-0,05"],
    [MAX_CENTS, "99.999.999,99"],
  ])("toBRLInput(%i) = %j", (cents, text) => {
    expect(toBRLInput(c(cents))).toBe(text);
  });

  it("toBRLInput e parseBRL fazem ida e volta", () => {
    for (const cents of [
      0,
      1,
      99,
      100,
      123456,
      100000000,
      MAX_CENTS,
      -1,
      -123456,
    ]) {
      expect(parseBRL(toBRLInput(c(cents)), { allowNegative: true })).toEqual({
        ok: true,
        value: cents,
      });
    }
  });
});

describe("fromDbNumeric / toDbNumeric", () => {
  it.each([
    ["1234.56", 123456],
    ["-0.50", -50],
    ["10", 1000],
    ["10.5", 1050],
    ["0.00", 0],
    ["-0.00", 0],
    ["0.05", 5],
    ["99999999.99", MAX_CENTS],
    ["-99999999.99", -MAX_CENTS],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("fromDbNumeric(%j) = %i", (text, cents) => {
    expect(fromDbNumeric(text)).toBe(cents);
  });

  it.each([
    "",
    "abc",
    "1,5",
    "1.234",
    "1.2.3",
    " 1.00",
    "+1.00",
    ".5",
    "1.",
    "1e2",
    "NaN",
  ])("fromDbNumeric(%j) lança", (text) => {
    expect(() => fromDbNumeric(text)).toThrow(RangeError);
  });

  it("fromDbNumeric lança fora da faixa", () => {
    expect(fromDbNumeric("1000000000000.00")).toBe(100_000_000_000_000);
    expect(() => fromDbNumeric("90071992547409.92")).toThrow(RangeError);
    expect(() => fromDbNumeric("-90071992547409.92")).toThrow(RangeError);
  });

  it.each([
    [123456, "1234.56"],
    [-5, "-0.05"],
    [0, "0.00"],
    [1, "0.01"],
    [100, "1.00"],
    [-123456, "-1234.56"],
    [MAX_CENTS, "99999999.99"],
  ])("toDbNumeric(%i) = %j", (cents, text) => {
    expect(toDbNumeric(c(cents))).toBe(text);
  });

  it("ida e volta sem perda", () => {
    for (const cents of [
      0,
      1,
      5,
      99,
      100,
      101,
      123456,
      -1,
      -5,
      -100,
      MAX_CENTS,
      -MAX_CENTS,
    ]) {
      expect(fromDbNumeric(toDbNumeric(c(cents)))).toBe(cents);
    }
  });
});

describe("aritmética", () => {
  it("soma, subtrai e nega", () => {
    expect(addCents(c(10), c(5))).toBe(15);
    expect(subCents(c(10), c(25))).toBe(-15);
    expect(negCents(c(10))).toBe(-10);
    expect(Object.is(negCents(c(0)), 0)).toBe(true);
    expect(sumCents([c(100), c(250), c(-50)])).toBe(300);
    expect(sumCents([])).toBe(0);
  });

  it("não tem erro de ponto flutuante (0,10 + 0,20 = 0,30)", () => {
    expect(addCents(c(10), c(20))).toBe(30);
  });

  it("agregados passam do teto por valor (SEC-18), mas não do inteiro seguro", () => {
    expect(addCents(c(MAX_CENTS), c(MAX_CENTS))).toBe(MAX_CENTS * 2);
    expect(sumCents([c(MAX_CENTS), c(MAX_CENTS), c(1)])).toBe(
      MAX_CENTS * 2 + 1,
    );
    const safe = fromDbNumeric("90071992547409.91");
    expect(() => addCents(safe, c(1))).toThrow(RangeError);
    expect(() => subCents(negCents(safe), c(1))).toThrow(RangeError);
    expect(() => sumCents([safe, c(1)])).toThrow(RangeError);
    expect(() => fromDbNumeric("90071992547409.92")).toThrow(RangeError);
    expect(() => fromDbNumeric("123456789012345.00")).toThrow(RangeError);
  });
});

describe("allocate (D13/R6)", () => {
  const sum = (list: Cents[]) => list.reduce((acc, v) => acc + v, 0);

  it("R6: 100,00 / 3 = 33,34 + 33,33 + 33,33", () => {
    expect(allocate(c(10000), "equal", 3)).toEqual([3334, 3333, 3333]);
    expect(allocate(c(10000), [1, 1, 1])).toEqual([3334, 3333, 3333]);
  });

  it("por peso, maior resto", () => {
    expect(allocate(c(10000), [50, 30, 20])).toEqual([5000, 3000, 2000]);
    expect(allocate(c(100), [1, 2])).toEqual([33, 67]);
    expect(allocate(c(1), [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocate(c(0), [1, 2, 3])).toEqual([0, 0, 0]);
  });

  it("peso zero não recebe nada", () => {
    expect(allocate(c(100), [0, 1, 1])).toEqual([0, 50, 50]);
    expect(allocate(c(1), [0, 1, 1])).toEqual([0, 1, 0]);
  });

  it("total negativo é simétrico", () => {
    expect(allocate(c(-10000), "equal", 3)).toEqual([-3334, -3333, -3333]);
  });

  it("uma parte recebe tudo", () => {
    expect(allocate(c(12345), "equal", 1)).toEqual([12345]);
  });

  it("propriedade: a soma é sempre exatamente o total", () => {
    let seed = 12345;
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    for (let i = 0; i < 500; i++) {
      const total = rand(2) === 0 ? rand(10_000_000) : -rand(10_000_000);
      const n = 1 + rand(9);
      const weights: number[] = Array.from({ length: n }, () => rand(1000));
      if (Math.max(...weights) === 0) weights[0] = 1;
      const result = allocate(c(total), weights);
      expect(sum(result)).toBe(total);
      const equal = allocate(c(total), "equal", n);
      expect(sum(equal)).toBe(total);
      // Nenhuma parte difere da cota exata em mais de 1 centavo.
      const weightSum = weights.reduce((a, b) => a + b, 0);
      result.forEach((part, idx) => {
        const exact = (total * (weights[idx] ?? 0)) / weightSum;
        expect(Math.abs(part - exact)).toBeLessThan(1);
      });
    }
  });

  it("soma exata com valores grandes (sem perder precisão)", () => {
    const total = c(MAX_CENTS);
    const result = allocate(total, [999_999, 1_000_001, 7]);
    expect(sum(result)).toBe(MAX_CENTS);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => allocate(c(100), [])).toThrow(RangeError);
    expect(() => allocate(c(100), [0, 0])).toThrow(RangeError);
    expect(() => allocate(c(100), [1, -1])).toThrow(RangeError);
    expect(() => allocate(c(100), [1.5, 1])).toThrow(RangeError);
    expect(() => allocate(c(100), "equal")).toThrow(RangeError);
    expect(() => allocate(c(100), "equal", 0)).toThrow(RangeError);
  });
});

describe("percentOf", () => {
  it("calcula o percentual e devolve null quando o total é zero", () => {
    expect(percentOf(c(25), c(100))).toBe(25);
    expect(percentOf(c(1), c(3))).toBeCloseTo(33.333, 2);
    expect(percentOf(c(50), c(0))).toBeNull();
    expect(percentOf(c(0), c(0))).toBeNull();
    expect(percentOf(c(150), c(100))).toBe(150);
  });
});
