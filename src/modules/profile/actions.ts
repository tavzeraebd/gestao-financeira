"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { updateProfileSchema } from "@/modules/profile/schemas";
import { updateOwnProfile } from "@/modules/profile/repository";
import { runAction, type ActionResult } from "@/server/action";
import { AppError } from "@/server/errors";

export async function updateProfile(
  input: z.input<typeof updateProfileSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "profile",
    operation: "updateProfile",
    schema: updateProfileSchema,
    input,
    auth: "required",
    handler: async (data, { supabase, userId }) => {
      if (!userId) throw new AppError("UNAUTHENTICATED");
      // Só a própria linha: filtro por id + RLS (profiles_update_self).
      const updated = await updateOwnProfile(
        supabase,
        userId,
        data.displayName,
      );
      if (!updated) throw new AppError("NOT_FOUND");
      revalidatePath("/", "layout");
      return null;
    },
  });
}
