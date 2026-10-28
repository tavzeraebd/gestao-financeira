import { redirect } from "next/navigation";

import { Logo } from "@/components/shared/logo";
import { SkipLink } from "@/components/shared/skip-link";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { getOptionalMembership, requireUser } from "@/server/auth";

export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();
  const membership = await getOptionalMembership();
  if (membership) redirect("/inicio");

  return (
    <div className="bg-background relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <SkipLink />
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex justify-center">
          <Logo variant="full" />
        </div>
        <main id="conteudo" tabIndex={-1} className="outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
