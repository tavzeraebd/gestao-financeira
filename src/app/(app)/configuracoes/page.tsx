import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignOutButton } from "@/modules/auth/components/sign-out-button";
import { ThemeOptions } from "@/modules/profile/components/theme-options";
import { UpdateProfileForm } from "@/modules/profile/components/update-profile-form";
import { getMyProfile } from "@/modules/profile/queries";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await requireMembership();
  const profile = await getMyProfile();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Seu perfil, a aparência do app e a sessão."
      />

      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="text-lg">Perfil</CardTitle>
          <CardDescription>
            O nome aparece para as outras pessoas da família.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdateProfileForm
            displayName={profile.displayName}
            email={profile.email}
          />
        </CardContent>
      </Card>

      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="text-lg">Tema</CardTitle>
          <CardDescription>
            A escolha fica salva neste navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeOptions />
        </CardContent>
      </Card>

      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="text-lg">Sessão</CardTitle>
          <CardDescription>
            Saia da conta neste dispositivo quando terminar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
