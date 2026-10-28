import {
  diffInDays,
  formatDateBR,
  formatMonthBR,
  parseISODate,
  type ISODate,
} from "@/lib/dates";
import { formatBRL, fromDbNumeric, type Cents } from "@/lib/money";
import { roleLabel } from "@/modules/family/domain/role-labels";
import type { NotificationIcon, NotificationType } from "../constants";
import type { NotificationRow } from "../types";

export type RenderContext = {
  today: ISODate;
  memberName: (memberId: string) => string;
};

export type RenderedNotification = {
  title: string;
  message: string;
  href: string | null;
  icon: NotificationIcon;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(data: unknown): Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : fallback;
}

/** Montante gravado como texto decimal; qualquer outra coisa vira `null` (nunca lança). */
function cents(value: unknown): Cents | null {
  if (typeof value !== "string") return null;
  try {
    return fromDbNumeric(value);
  } catch {
    return null;
  }
}

function money(value: unknown): string {
  const c = cents(value);
  return c === null ? "valor indisponível" : formatBRL(c);
}

function date(value: unknown): ISODate | null {
  return typeof value === "string" ? parseISODate(value) : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** `href` só da lista fechada de rotas internas; `id` precisa ser uuid. */
function hrefFor(
  row: NotificationRow,
  data: Record<string, unknown>,
  type: NotificationType | "unknown",
): string | null {
  const id = row.entityId;
  switch (row.entityType) {
    case "transaction": {
      if (!UUID.test(id)) return null;
      const pending =
        type === "bill_due_soon" ||
        type === "bill_overdue" ||
        data.status === "pending";
      return pending ? `/compromissos/${id}` : `/transacoes/${id}`;
    }
    case "goal":
      return UUID.test(id) ? `/metas/${id}` : null;
    case "budget": {
      const month = typeof data.month === "string" ? data.month : "";
      return /^\d{4}-\d{2}$/.test(month)
        ? `/orcamentos?mes=${month}`
        : "/orcamentos";
    }
    case "family_member":
      return "/familia";
    case "settlement":
      return "/divisao/acertos";
    default:
      return null;
  }
}

function dueText(due: ISODate | null, today: ISODate): string {
  if (!due) return "tem vencimento próximo";
  const days = diffInDays(today, due);
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  if (days > 1) return `vence em ${days} dias`;
  return `venceu em ${formatDateBR(due)}`;
}

function knownType(value: string): NotificationType | "unknown" {
  switch (value) {
    case "bill_due_soon":
    case "bill_overdue":
    case "goal_near_target":
    case "budget_near_limit":
    case "member_joined":
    case "financial_event":
      return value;
    default:
      return "unknown";
  }
}

/**
 * Texto pt-BR e link de uma notificação (ADR-0029). Nada de URL gravada: o `href` sai da lista fechada por
 * tipo de entidade. `data` é um instantâneo não confiável: campo ausente ou inválido nunca lança.
 */
export function renderNotification(
  n: NotificationRow,
  ctx: RenderContext,
): RenderedNotification {
  const data = record(n.data);
  const type = knownType(n.type);
  const href = hrefFor(n, data, type);

  switch (type) {
    case "bill_due_soon": {
      const income = data.kind === "income";
      return {
        title: income ? "Recebimento a vencer" : "Conta a vencer",
        message: `${text(data.description, "Compromisso")} ${dueText(date(data.due_date), ctx.today)} · ${money(data.amount)}`,
        href,
        icon: "bill",
      };
    }
    case "bill_overdue": {
      const income = data.kind === "income";
      const due = date(data.due_date);
      return {
        title: income ? "Recebimento atrasado" : "Conta vencida",
        message: `${text(data.description, "Compromisso")} venceu${due ? ` em ${formatDateBR(due)}` : ""} · ${money(data.amount)}`,
        href,
        icon: "overdue",
      };
    }
    case "budget_near_limit": {
      const month =
        typeof data.month === "string"
          ? parseISODate(`${data.month}-01`)
          : null;
      const percent = integer(data.percent);
      const name = text(data.category_name, "Todas as despesas");
      return {
        title: "Orçamento perto do limite",
        message: `${name}${percent !== null ? ` chegou a ${percent}% do limite` : " chegou perto do limite"}${month ? ` em ${formatMonthBR(month, "long")}` : ""} · ${money(data.spent)} de ${money(data.limit)}`,
        href,
        icon: "budget",
      };
    }
    case "goal_near_target": {
      const percent = integer(data.percent);
      return {
        title: "Meta próxima",
        message: `Sua meta ${text(data.name, "sem nome")} atingiu ${percent !== null ? `${percent}%` : "quase todo o valor"}`,
        href,
        icon: "goal",
      };
    }
    case "member_joined": {
      return {
        title: "Novo integrante",
        message: `${ctx.memberName(n.entityId)} entrou na família como ${roleLabel(data.role)}`,
        href,
        icon: "member",
      };
    }
    case "financial_event": {
      if (n.entityType === "settlement") {
        const toMe = data.direction === "to_me";
        return {
          title: "Acerto registrado",
          message: `${toMe ? "Você recebeu" : "Você pagou"} ${money(data.amount)} em um acerto`,
          href,
          icon: "event",
        };
      }
      const income = data.kind === "income";
      return {
        title: income ? "Receita registrada" : "Despesa registrada",
        message: `${text(data.description, "Sem descrição")} · ${money(data.amount)}`,
        href,
        icon: "event",
      };
    }
    default:
      return {
        title: "Notificação",
        message: "Há uma novidade na sua família.",
        href: null,
        icon: "event",
      };
  }
}
