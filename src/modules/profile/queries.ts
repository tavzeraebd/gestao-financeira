import "server-only";
import { createClient } from "@/lib/supabase/server";
import { findProfile } from "@/modules/profile/repository";
import { requireUser } from "@/server/auth";
import { AppError } from "@/server/errors";

export async function getMyProfile(): Promise<{
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
}> {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await findProfile(supabase, user.id);
  if (!profile) throw new AppError("NOT_FOUND");
  return { ...profile, email: user.email };
}
