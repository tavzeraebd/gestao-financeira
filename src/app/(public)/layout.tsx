import { Logo } from "@/components/shared/logo";
import { SkipLink } from "@/components/shared/skip-link";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-background relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <SkipLink />
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo variant="full" className="[&_svg]:size-10 [&>span]:text-3xl" />
          <p className="text-muted-foreground text-sm">
            Sua família no controle do dinheiro.
          </p>
        </div>
        <main id="conteudo" tabIndex={-1} className="outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
