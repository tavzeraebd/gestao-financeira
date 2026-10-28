import { AlertTriangleIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatActivityDate } from "@/modules/activity/components/activity-list";
import type { SecurityEvent } from "@/modules/profile/types";

const ACTION_LABEL: Record<SecurityEvent["action"], string> = {
  "password.changed": "Senha alterada",
};

/** Atividade de segurança de /configuracoes: `events: null` indica falha ao carregar. */
export function SecurityActivitySection({
  events,
}: {
  events: SecurityEvent[] | null;
}) {
  return (
    <Card
      role="region"
      aria-labelledby="atividade-seguranca-titulo"
      className="[--card-spacing:--spacing(5)]"
    >
      <CardHeader>
        <CardTitle
          id="atividade-seguranca-titulo"
          role="heading"
          aria-level={2}
          className="text-lg"
        >
          Atividade de segurança
        </CardTitle>
        <CardDescription>
          Os últimos eventos da sua conta, como a troca de senha.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events === null ? (
          <Alert variant="warning">
            <AlertTriangleIcon aria-hidden="true" />
            <AlertDescription>
              Não foi possível carregar a atividade de segurança. Recarregue a
              página em instantes.
            </AlertDescription>
          </Alert>
        ) : events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum evento registrado
          </p>
        ) : (
          <ul className="divide-border flex flex-col divide-y text-sm">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
              >
                <span className="font-medium">
                  {ACTION_LABEL[event.action]}
                </span>
                <time
                  dateTime={event.createdAt}
                  className="text-muted-foreground"
                >
                  {formatActivityDate(event.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
