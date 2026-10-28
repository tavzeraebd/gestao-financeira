"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { today } from "@/lib/dates";
import { memberDisplayName } from "@/modules/family/domain/member-name";
import { listActiveMembers } from "@/modules/family/repository";
import { renderNotification } from "@/modules/notifications/domain/render";
import {
  markAllNotificationsReadRows,
  markNotificationRead,
} from "@/modules/notifications/repository";
import { notificationIdSchema } from "@/modules/notifications/schemas";
import { runAction, type ActionResult } from "@/server/action";
import { requireMembership } from "@/server/auth";
import { AppError } from "@/server/errors";

// Nenhuma action recebe family_id nem user_id: a RLS limita ao próprio usuário (ADR-0029).

/** Marca como lida e devolve o link da lista fechada (`null` = o item não existe mais). */
export async function openNotification(
  input: z.input<typeof notificationIdSchema>,
): Promise<ActionResult<{ href: string | null }>> {
  return runAction({
    module: "notifications",
    operation: "openNotification",
    schema: notificationIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const membership = await requireMembership();
      const row = await markNotificationRead(supabase, data.notificationId);
      // 0 linhas: igual para inexistente e alheia.
      if (!row) throw new AppError("NOT_FOUND");

      let names = new Map<string, string>();
      if (row.type === "member_joined") {
        const members = await listActiveMembers(
          supabase,
          membership.familyId,
          membership.userId,
        );
        names = new Map(members.map((m) => [m.memberId, m.displayName]));
      }
      const { href } = renderNotification(row, {
        today: today(),
        memberName: (id) => memberDisplayName(names.get(id) ?? null),
      });
      revalidatePath("/", "layout");
      return { href };
    },
  });
}

export async function markAllNotificationsRead(): Promise<
  ActionResult<{ count: number }>
> {
  return runAction({
    module: "notifications",
    operation: "markAllNotificationsRead",
    schema: z.object({}),
    input: {},
    auth: "required",
    handler: async (_data, { supabase }) => {
      await requireMembership();
      const count = await markAllNotificationsReadRows(supabase);
      revalidatePath("/", "layout");
      return { count };
    },
  });
}
