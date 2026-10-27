"use client";

import { CalculatorIcon, WalletIcon } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { MoneyInput } from "@/components/shared/money-input";
import { ValueSourceBadge } from "@/components/shared/value-source-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { asCents } from "@/lib/money";
import {
  SCENARIOS,
  SCENARIOS_WITH_BASELINE,
  SCENARIO_LABELS,
  type Scenario,
} from "@/modules/planning/constants";
import { simulateFinancing } from "@/modules/planning/domain/financing";
import { simulateGoalDeadline } from "@/modules/planning/domain/goal-deadline";
import { simulateNewCommitment } from "@/modules/planning/domain/new-commitment";
import { projectBalance } from "@/modules/planning/domain/projection";
import { simulateReduction } from "@/modules/planning/domain/reduction";
import { simulateSaving } from "@/modules/planning/domain/saving";
import {
  financingSchema,
  goalDeadlineSchema,
  newCommitmentSchema,
  projectionSchema,
  reductionSchema,
  savingSchema,
} from "@/modules/planning/schemas";
import type { PlanningBaseline } from "@/modules/planning/types";
import {
  OptionSelect,
  type SelectOption,
} from "@/modules/transactions/components/option-select";
import { ScenarioResult, type ScenarioOutcome } from "./scenario-result";

type FieldKind = "money" | "text" | "goal" | "category";
type FieldDef = {
  name: string;
  label: string;
  kind: FieldKind;
  help?: string;
  inputMode?: "numeric" | "decimal";
  initial?: string;
};

const RATE_HELP =
  "Use a taxa da proposta ou do contrato. O Núcleo não sugere taxas.";

const FIELDS: Record<Scenario, FieldDef[]> = {
  financiamento: [
    { name: "value", label: "Valor do bem", kind: "money" },
    { name: "downPayment", label: "Entrada", kind: "money", initial: "0,00" },
    { name: "months", label: "Prazo em meses", kind: "text", inputMode: "numeric" },
    { name: "monthlyRate", label: "Taxa mensal (%)", kind: "text", inputMode: "decimal", help: RATE_HELP },
  ],
  objetivo: [
    { name: "target", label: "Valor do objetivo", kind: "money" },
    { name: "saved", label: "Já guardado (opcional)", kind: "money" },
    { name: "monthlyContribution", label: "Aporte mensal (opcional)", kind: "money", help: "Informe o aporte mensal ou o prazo." },
    { name: "months", label: "Prazo em meses (opcional)", kind: "text", inputMode: "numeric" },
  ],
  prazo_meta: [
    { name: "goalId", label: "Meta", kind: "goal" },
    { name: "monthly", label: "Aporte mensal (opcional)", kind: "money", help: "Em branco, usamos o ritmo atual da meta." },
  ],
  novo_compromisso: [
    { name: "monthly", label: "Valor mensal do compromisso", kind: "money" },
  ],
  reducao_despesas: [
    { name: "categoryId", label: "Categoria", kind: "category" },
    { name: "percent", label: "Redução em % (opcional)", kind: "text", inputMode: "decimal", help: "Informe o percentual ou o valor." },
    { name: "amount", label: "Redução em valor (opcional)", kind: "money" },
  ],
  saldo_futuro: [
    { name: "months", label: "Quantos meses projetar", kind: "text", inputMode: "numeric", initial: "6" },
    { name: "monthlyAdjustment", label: "Ajuste mensal (opcional)", kind: "money", help: "Some ou subtraia um valor por mês. Aceita valor negativo." },
  ],
};

type Values = Record<string, string>;
type RunResult =
  | { errors: Record<string, string> }
  | { outcome: ScenarioOutcome };

function initialValues(scenario: Scenario): Values {
  return Object.fromEntries(
    FIELDS[scenario].map((f) => [f.name, f.initial ?? ""]),
  );
}

function fail(
  error: { issues: readonly { path: PropertyKey[]; message: string }[] },
): RunResult {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    errors[key] ??= issue.message;
  }
  return { errors };
}

/** Valida com o schema do cenário e chama a função de domínio; nenhum cálculo é feito aqui. */
function run(scenario: Scenario, values: Values, baseline: PlanningBaseline): RunResult {
  const today = baseline.today;
  switch (scenario) {
    case "financiamento": {
      const r = financingSchema.safeParse(values);
      if (!r.success) return fail(r.error);
      return {
        outcome: simulateFinancing({
          value: r.data.value,
          downPayment: r.data.downPayment,
          months: r.data.months,
          monthlyRatePercent: r.data.monthlyRate,
        }),
      };
    }
    case "objetivo": {
      const r = savingSchema.safeParse(values);
      if (!r.success) return fail(r.error);
      const saved = r.data.saved ?? asCents(0);
      const base = { target: r.data.target, saved, today };
      return {
        outcome:
          r.data.monthlyContribution !== undefined
            ? simulateSaving({ ...base, monthlyContribution: r.data.monthlyContribution })
            : simulateSaving({ ...base, months: r.data.months as number }),
      };
    }
    case "prazo_meta": {
      const r = goalDeadlineSchema.safeParse(values);
      if (!r.success) return fail(r.error);
      const goal = baseline.goals.find((g) => g.id === r.data.goalId);
      if (!goal) return { errors: { goalId: "Escolha uma meta." } };
      return {
        outcome: simulateGoalDeadline({ goal, monthly: r.data.monthly, today }),
      };
    }
    case "novo_compromisso": {
      const r = newCommitmentSchema.safeParse(values);
      if (!r.success) return fail(r.error);
      return {
        outcome: simulateNewCommitment({ monthly: r.data.monthly, baseline }),
      };
    }
    case "reducao_despesas": {
      const r = reductionSchema.safeParse(values);
      if (!r.success) return fail(r.error);
      const base = { categoryId: r.data.categoryId, baseline };
      return {
        outcome:
          r.data.percent !== undefined
            ? simulateReduction({ ...base, percent: r.data.percent })
            : simulateReduction({ ...base, amount: r.data.amount as NonNullable<typeof r.data.amount> }),
      };
    }
    case "saldo_futuro": {
      const r = projectionSchema.safeParse(values);
      if (!r.success) return fail(r.error);
      return {
        outcome: projectBalance({
          months: r.data.months,
          monthlyAdjustment: r.data.monthlyAdjustment,
          baseline,
        }),
      };
    }
  }
}

function scenarioOptions(): SelectOption[] {
  return SCENARIOS.map((s) => ({ value: s, label: SCENARIO_LABELS[s] }));
}

export function PlanningSimulator({ baseline }: { baseline: PlanningBaseline }) {
  const [scenario, setScenario] = useState<Scenario>("financiamento");
  const [values, setValues] = useState<Values>(() => initialValues("financiamento"));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<ScenarioOutcome | null>(null);

  function changeScenario(next: string) {
    if (!(SCENARIOS as readonly string[]).includes(next)) return;
    const typed = next as Scenario;
    setScenario(typed);
    setValues(initialValues(typed));
    setErrors({});
    setOutcome(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = run(scenario, values, baseline);
    if ("errors" in result) {
      setErrors(result.errors);
      setOutcome(null);
      return;
    }
    setErrors({});
    setOutcome(result.outcome);
  }

  const needsBaseline = SCENARIOS_WITH_BASELINE.includes(scenario);
  let blocked: { title: string; description: string } | null = null;
  if (needsBaseline && !baseline.hasAccounts) {
    blocked = {
      title: "Cadastre uma conta para simular com seus dados",
      description:
        "Este cenário usa o saldo e as médias da família. Os cenários de financiamento e de objetivo funcionam sem contas.",
    };
  } else if (scenario === "prazo_meta" && baseline.goals.length === 0) {
    blocked = {
      title: "Nenhuma meta ativa",
      description: "Crie uma meta em Metas para simular o prazo dela.",
    };
  } else if (scenario === "reducao_despesas" && baseline.categoryAverages.length === 0) {
    blocked = {
      title: "Ainda não há despesas para reduzir",
      description: "Registre despesas por alguns meses para termos uma média por categoria.",
    };
  }

  const goalOptions: SelectOption[] = baseline.goals.map((g) => ({
    value: g.id,
    label: g.name,
  }));
  const categoryOptions: SelectOption[] = baseline.categoryAverages.map((c) => ({
    value: c.categoryId,
    label: c.name,
  }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="text-base">Simulador de cenários</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post" noValidate onSubmit={submit} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="cenario">Qual objetivo você quer simular?</FieldLabel>
              <OptionSelect
                id="cenario"
                value={scenario}
                onValueChange={changeScenario}
                options={scenarioOptions()}
              />
            </Field>

            {blocked ? (
              <EmptyState icon={WalletIcon} title={blocked.title} description={blocked.description} />
            ) : (
              <>
                {FIELDS[scenario].map((def) => {
                  const id = `cenario-${def.name}`;
                  const error = errors[def.name];
                  const describedBy =
                    [error ? `${id}-erro` : null, def.help ? `${id}-ajuda` : null]
                      .filter(Boolean)
                      .join(" ") || undefined;
                  const set = (value: string) =>
                    setValues((current) => ({ ...current, [def.name]: value }));
                  return (
                    <Field key={`${scenario}-${def.name}`} data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={id}>{def.label}</FieldLabel>
                      {def.kind === "money" ? (
                        <MoneyInput
                          id={id}
                          value={values[def.name] ?? ""}
                          onChange={set}
                          allowNegative={def.name === "monthlyAdjustment"}
                          aria-invalid={Boolean(error)}
                          aria-describedby={describedBy}
                        />
                      ) : def.kind === "text" ? (
                        <Input
                          id={id}
                          value={values[def.name] ?? ""}
                          onChange={(e) => set(e.target.value)}
                          inputMode={def.inputMode}
                          autoComplete="off"
                          aria-invalid={Boolean(error)}
                          aria-describedby={describedBy}
                        />
                      ) : (
                        <OptionSelect
                          id={id}
                          value={values[def.name] ?? ""}
                          onValueChange={set}
                          options={def.kind === "goal" ? goalOptions : categoryOptions}
                          placeholder={def.kind === "goal" ? "Selecione a meta" : "Selecione a categoria"}
                          invalid={Boolean(error)}
                          describedBy={describedBy}
                        />
                      )}
                      {def.help ? <FieldDescription id={`${id}-ajuda`}>{def.help}</FieldDescription> : null}
                      {error ? <FieldError id={`${id}-erro`}>{error}</FieldError> : null}
                    </Field>
                  );
                })}
              </>
            )}

            <div>
              <Button type="submit" disabled={blocked !== null}>
                <CalculatorIcon aria-hidden="true" data-icon="inline-start" />
                Simular
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="[--card-spacing:--spacing(5)]">
          <CardHeader>
            <CardTitle className="text-base">Resultado estimado</CardTitle>
          </CardHeader>
          <CardContent>
            <div aria-live="polite">
              {outcome ? (
                <ScenarioResult outcome={outcome} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Preencha os campos e escolha Simular para ver o resultado.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {baseline.hasAccounts ? (
          <Card className="[--card-spacing:--spacing(5)]">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p>
                Seu resultado médio nos últimos 3 meses foi{" "}
                <Money cents={baseline.averageMonthly.result} className="font-semibold" />.
              </p>
              <ValueSourceBadge source="known" />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
