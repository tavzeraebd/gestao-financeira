"use client";

import { usePathname } from "next/navigation";

import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { navItems } from "@/config/navigation";

type AppHeaderProps = {
  displayName: string;
  email: string;
  avatarUrl: string | null;
};

export function AppHeader({ displayName, email, avatarUrl }: AppHeaderProps) {
  const pathname = usePathname();
  const current = navItems.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );

  return (
    <header className="bg-background/95 sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b px-4 backdrop-blur md:px-6">
      <SidebarTrigger
        aria-label="Recolher ou expandir o menu"
        className="hidden size-10 md:inline-flex"
      />
      <Logo variant="mark" className="md:hidden" />
      <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm font-medium">
        {current?.label ?? "Núcleo"}
      </p>
      <ThemeToggle />
      <UserMenu displayName={displayName} email={email} avatarUrl={avatarUrl} />
    </header>
  );
}
