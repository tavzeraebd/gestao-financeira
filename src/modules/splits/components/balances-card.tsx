import Link from "next/link";

import { Money } from "@/components/shared/money";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemberBalances } from "@/modules/splits/types";

/** Frases de saldo entre integrantes ("Bianca deve R$ 20,00 a Ana"). Nomes já vêm de `memberDisplayName`. */
export function BalancesCard({ balances }: { balances: MemberBalances }) {
  return (
    <Card className="[--card-spacing:--spacing(5)]">
      <CardHeader>
        <CardTitle className="text-base">Quem deve a quem</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {balances.pairs.length === 0 ? (
          <p className="text-sm">Ninguém deve nada</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {balances.pairs.map((pair) => (
              <li
                key={`${pair.debtor.id}-${pair.creditor.id}`}
                className="text-sm"
              >
                <span className="font-medium">{pair.debtor.displayName}</span>{" "}
                deve <Money cents={pair.amount} className="font-semibold" /> a{" "}
                <span className="font-medium">{pair.creditor.displayName}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/divisao/acertos/novo"
            className={buttonVariants({ variant: "outline" })}
          >
            Registrar acerto
          </Link>
          <Link
            href="/divisao/acertos"
            className={buttonVariants({ variant: "ghost" })}
          >
            Ver acertos
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
