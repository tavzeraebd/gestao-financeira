import { formatDateBR, parseISODate } from "@/lib/dates";
import { formatBRL, fromDbNumeric } from "@/lib/money";
import { roleLabel } from "@/modules/family/domain/role-labels";

export type AuditEventInput = {
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
};

export type DescribeContext = { memberName: (memberId: string) => string };

export type DescribedEvent = {
  title: string;
  detail: string | null;
  href: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNKNOWN: DescribedEvent = {
  title: "Alteração registrada",
  detail: null,
  href: null,
};

function obj(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function money(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return formatBRL(fromDbNumeric(value));
  } catch {
    return null;
  }
}

function day(value: unknown): string | null {
  const d = typeof value === "string" ? parseISODate(value) : null;
  return d ? formatDateBR(d) : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function join(parts: (string | null)[]): string | null {
  const list = parts.filter((p): p is string => p !== null);
  return list.length > 0 ? list.join(" · ") : null;
}

function change(
  label: string,
  from: string | null,
  to: string | null,
): string | null {
  if (from !== null && to !== null) return `${label} ${from} → ${to}`;
  if (to !== null) return `${label} ${to}`;
  return null;
}

/** Texto das mudanças financeiras de `transaction.updated` / `transaction.paid` (só campos do catálogo). */
function transactionChanges(meta: Record<string, unknown>): string | null {
  const changed = strings(meta.changed);
  const old = obj(meta.old);
  const next = obj(meta.new);
  const parts: (string | null)[] = [];
  if (changed.includes("amount")) {
    parts.push(
      change(
        "Valor",
        money(old.amount),
        money(next.amount) ?? money(meta.amount),
      ),
    );
  }
  if (changed.includes("transaction_date")) {
    parts.push(
      change("Data", day(old.transaction_date), day(next.transaction_date)),
    );
  }
  if (changed.includes("account_id")) parts.push("Conta alterada");
  if (changed.includes("destination_account_id")) {
    parts.push("Conta de destino alterada");
  }
  if (changed.includes("category_id")) parts.push("Categoria alterada");
  return join(parts);
}

function detailOfMoneyDate(meta: Record<string, unknown>): string | null {
  const dateKey =
    "transaction_date" in meta ? "transaction_date" : "settlement_date";
  return join([money(meta.amount), day(meta[dateKey])]);
}

function transactionHref(
  entityId: string | null,
  pending: boolean,
): string | null {
  const id = uuid(entityId);
  if (!id) return null;
  return pending ? `/compromissos/${id}` : `/transacoes/${id}`;
}

/**
 * Descrição pt-BR de um evento de auditoria (catálogo fechado, `data-model.md` §4.6). Ação desconhecida ->
 * "Alteração registrada", sem mostrar a metadata crua. Nunca lança.
 */
export function describeAuditEvent(
  e: AuditEventInput,
  ctx: DescribeContext,
): DescribedEvent {
  const meta = obj(e.metadata);
  const member = (key: string): string => {
    const id = uuid(meta[key]);
    return id ? ctx.memberName(id) : "Integrante";
  };

  switch (e.action) {
    case "family.created":
      return { title: "Família criada", detail: null, href: "/familia" };
    case "family.updated":
      return {
        title: "Nome da família alterado",
        detail: null,
        href: "/familia",
      };
    case "family.ownership_transferred":
      return {
        title: "Propriedade transferida",
        detail: `Novo proprietário: ${member("member_id")}`,
        href: "/familia",
      };
    case "invite.created":
      return {
        title: "Convite criado",
        detail: join([
          `Papel: ${roleLabel(meta.role)}`,
          meta.has_email_binding === true ? "Vinculado a um e-mail" : null,
        ]),
        href: "/familia",
      };
    case "invite.revoked":
      return {
        title: "Convite revogado",
        detail:
          meta.reason === "member_ended"
            ? "Quem criou o convite saiu da família"
            : null,
        href: "/familia",
      };
    case "member.joined":
      return {
        title: "Novo integrante",
        detail: `${member("member_id")} entrou como ${roleLabel(meta.role)}`,
        href: "/familia",
      };
    case "member.role_changed":
      return {
        title: "Papel alterado",
        detail: `${member("member_id")}: ${roleLabel(meta.from_role)} → ${roleLabel(meta.to_role)}`,
        href: "/familia",
      };
    case "member.removed":
    case "member.left": {
      const revoked =
        typeof meta.revoked_invites === "number" && meta.revoked_invites > 0
          ? `${meta.revoked_invites} convite(s) revogado(s)`
          : null;
      return {
        title:
          e.action === "member.removed"
            ? "Integrante removido"
            : "Integrante saiu",
        detail: join([
          `${member("member_id")} (${roleLabel(meta.from_role)})`,
          revoked,
        ]),
        href: "/familia",
      };
    }
    case "member.action_denied": {
      // Lista fechada de `operation`; o resto da metadata (reason etc.) nunca é exibido.
      const operations: Record<string, string> = {
        change_role: "Tentativa de alterar papel",
        transfer_ownership: "Tentativa de transferir propriedade",
        remove: "Tentativa de remover integrante",
      };
      const op =
        typeof meta.operation === "string" &&
        Object.hasOwn(operations, meta.operation)
          ? operations[meta.operation]
          : null;
      return {
        title: "Ação negada",
        detail: op ?? null,
        href: "/familia",
      };
    }
    case "account.archived":
      return { title: "Conta arquivada", detail: null, href: "/contas" };
    case "account.reactivated":
      return { title: "Conta reativada", detail: null, href: "/contas" };
    case "account.opening_balance_changed": {
      const old = obj(meta.old);
      const next = obj(meta.new);
      return {
        title: "Saldo inicial alterado",
        detail: change("Saldo", money(old.amount), money(next.amount)),
        href: "/contas",
      };
    }
    case "category.archived":
      return {
        title: "Categoria arquivada",
        detail: null,
        href: "/categorias",
      };
    case "category.unarchived":
      return {
        title: "Categoria reativada",
        detail: null,
        href: "/categorias",
      };
    case "category.deleted":
      return { title: "Categoria excluída", detail: null, href: "/categorias" };
    case "transaction.updated":
      return {
        title: "Lançamento editado",
        detail: transactionChanges(meta),
        href: transactionHref(e.entityId, false),
      };
    case "transaction.deleted":
      return {
        title: "Lançamento excluído",
        detail: detailOfMoneyDate(meta),
        href: null,
      };
    case "transaction.canceled":
      return {
        title: "Compromisso cancelado",
        detail: detailOfMoneyDate(meta),
        href: transactionHref(e.entityId, true),
      };
    case "transaction.reversed":
      return {
        title: "Lançamento estornado",
        detail: detailOfMoneyDate(meta),
        href: transactionHref(e.entityId, false),
      };
    case "transaction.paid":
      return {
        title: "Compromisso pago",
        detail: join([
          money(meta.amount),
          day(meta.transaction_date)
            ? `Pago em ${day(meta.transaction_date)}`
            : null,
          strings(meta.changed).includes("amount")
            ? change("Valor", money(obj(meta.old).amount), money(meta.amount))
            : null,
        ]),
        href: transactionHref(e.entityId, false),
      };
    case "transaction.splits_changed": {
      const id = uuid(e.entityId);
      const parts = typeof meta.parts === "number" ? meta.parts : null;
      const detail =
        meta.mode === "none"
          ? "Divisão removida"
          : meta.mode === "equal"
            ? `Dividida igualmente${parts ? ` entre ${parts}` : ""}`
            : meta.mode === "amounts"
              ? `Dividida por valores${parts ? ` entre ${parts}` : ""}`
              : null;
      return {
        title: "Divisão alterada",
        detail,
        href: id ? `/divisao/${id}` : null,
      };
    }
    case "recurrence.paused":
      return {
        title: "Recorrência pausada",
        detail: null,
        href: "/recorrencias",
      };
    case "recurrence.resumed":
      return {
        title: "Recorrência reativada",
        detail: null,
        href: "/recorrencias",
      };
    case "recurrence.series_updated":
      return {
        title: "Recorrência editada",
        detail: null,
        href: "/recorrencias",
      };
    case "goal.status_changed": {
      const id = uuid(e.entityId);
      const labels: Record<string, string> = {
        active: "Ativa",
        paused: "Pausada",
        completed: "Concluída",
        canceled: "Cancelada",
      };
      const from =
        typeof meta.from === "string" ? (labels[meta.from] ?? null) : null;
      const to = typeof meta.to === "string" ? (labels[meta.to] ?? null) : null;
      return {
        title: "Situação da meta alterada",
        detail: change("Situação", from, to),
        href: id ? `/metas/${id}` : null,
      };
    }
    case "goal.updated": {
      const id = uuid(e.entityId);
      const old = obj(meta.old);
      const next = obj(meta.new);
      const changed = strings(meta.changed);
      return {
        title: "Meta editada",
        detail: join([
          changed.includes("target_amount")
            ? change(
                "Alvo",
                money(old.target_amount),
                money(next.target_amount),
              )
            : null,
          changed.includes("target_date")
            ? change("Prazo", day(old.target_date), day(next.target_date))
            : null,
        ]),
        href: id ? `/metas/${id}` : null,
      };
    }
    case "goal_contribution.deleted": {
      const goalId = uuid(meta.goal_id);
      return {
        title:
          meta.kind === "withdrawal" ? "Retirada excluída" : "Aporte excluído",
        detail: money(meta.amount),
        href: goalId ? `/metas/${goalId}` : null,
      };
    }
    case "settlement.created":
      return {
        title: "Acerto registrado",
        detail: detailOfMoneyDate(meta),
        href: "/divisao/acertos",
      };
    case "settlement.deleted":
      return {
        title: "Acerto excluído",
        detail: detailOfMoneyDate(meta),
        href: "/divisao/acertos",
      };
    default:
      return UNKNOWN;
  }
}

/** Ids de integrante citados na metadata (para buscar os nomes numa única consulta). */
export function memberIdsOf(metadata: unknown): string[] {
  const meta = obj(metadata);
  return [meta.member_id, meta.previous_owner_member_id].flatMap((v) => {
    const id = uuid(v);
    return id ? [id] : [];
  });
}
