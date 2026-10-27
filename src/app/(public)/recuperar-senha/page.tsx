import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { RequestPasswordResetForm } from "@/modules/auth/components/request-password-reset-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecoverPasswordPage() {
  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardContent>
        <RequestPasswordResetForm />
      </CardContent>
    </Card>
  );
}
