import "server-only";
import { createClient } from "@/lib/supabase/server";
import { memberDisplayName } from "@/modules/family/domain/member-name";
import { can } from "@/modules/family/permissions";
import { requireMembership } from "@/server/auth";
import {
  actionsOfGroup,
  FORMER_ACTOR_NAME,
  SYSTEM_ACTOR_NAME,
} from "./constants";
import { describeAuditEvent, memberIdsOf } from "./domain/describe";
import { selectAuditPage, selectMemberNames } from "./repository";
import { activityFiltersSchema } from "./schemas";
import type { ActivityItem, ActivityPage } from "./types";

/**
 * Atividade da família (auditoria). `null` para quem não tem `audit.read` (a página dá `notFound()`).
 * A RLS de `audit_events` também restringe a owner/admin.
 */
export async function listActivity(
  filters: unknown = {},
): Promise<ActivityPage | null> {
  const membership = await requireMembership();
  if (!can(membership.role, "audit.read")) return null;
  const supabase = await createClient();
  const f = activityFiltersSchema.parse(filters);

  const { items, total } = await selectAuditPage(supabase, {
    actions: f.grupo ? actionsOfGroup(f.grupo) : null,
    de: f.de,
    ate: f.ate,
    page: f.pagina,
    size: f.por_pagina,
  });

  const names = await selectMemberNames(supabase, [
    ...new Set(items.flatMap((e) => memberIdsOf(e.metadata))),
  ]);
  const memberName = (id: string) => memberDisplayName(names.get(id) ?? null);

  const views: ActivityItem[] = items.map((e) => {
    const described = describeAuditEvent(e, { memberName });
    return {
      id: e.id,
      createdAt: e.createdAt,
      actor:
        e.actorUserId === null
          ? SYSTEM_ACTOR_NAME
          : e.actorName?.trim() || FORMER_ACTOR_NAME,
      title: described.title,
      detail: described.detail,
      href: described.href,
    };
  });
  return {
    items: views,
    total,
    page: f.pagina,
    pageSize: f.por_pagina,
    pageCount: Math.max(1, Math.ceil(total / f.por_pagina)),
  };
}
