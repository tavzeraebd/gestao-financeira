import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { SignUpForm } from "@/modules/auth/components/sign-up-form";

export const metadata: Metadata = { title: "Criar conta" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next } = await searchParams;
  const nextPath = Array.isArray(next) ? next[0] : next;

  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardContent>
        <SignUpForm next={nextPath} />
      </CardContent>
    </Card>
  );
}
