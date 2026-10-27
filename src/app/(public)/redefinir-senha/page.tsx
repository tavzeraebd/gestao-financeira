import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { UpdatePasswordForm } from "@/modules/auth/components/update-password-form";

export const metadata: Metadata = { title: "Criar nova senha" };

export default function ResetPasswordPage() {
  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardContent>
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  );
}
