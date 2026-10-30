import type { Metadata } from "next";

import { InfoHint } from "@/components/shared/info-hint";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/modules/auth/components/sign-out-button";
import { DeleteAccountSection } from "@/modules/profile/components/delete-account-section";
import { SecurityActivitySection } from "@/modules/profile/components/security-activity-section";
import { ThemeOptions } from "@/modules/profile/components/theme-options";
import { UpdateProfileForm } from "@/modules/profile/components/update-profile-form";
import {
  getAccountDeletionPreview,
  getMyProfile,
  listSecurityEvents,
} from "@/modules/profile/queries";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await requireMembership();
  const [profile, deletionPreview, securityEvents] = await Promise.all([
    getMyProfile(),
    getAccountDeletionPreview(),
    // Bloco secundário: falha aqui não derruba a página; a seção mostra o aviso.
    listSecurityEvents().catch(() => null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Seu perfil, a aparência do app, a sessão e a exclusão da conta."
      />

      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-1 text-lg">
            Perfil
            <InfoHint label="o perfil">
              O nome aparece para as outras pessoas da família.
            </InfoHint>
          </CardTitle>
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
          <CardTitle className="flex items-center gap-1 text-lg">
            Tema
            <InfoHint label="o tema">
              A escolha fica salva neste navegador.
            </InfoHint>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeOptions />
        </CardContent>
      </Card>

      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-1 text-lg">
            Sessão
            <InfoHint label="a sessão">
              Saia da conta neste dispositivo quando terminar.
            </InfoHint>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>

      <SecurityActivitySection events={securityEvents} />

      <DeleteAccountSection preview={deletionPreview} />
    </div>
  );
}
