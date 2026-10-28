import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SkipLink } from "@/components/shared/skip-link";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getUnreadNotificationCount } from "@/modules/notifications/queries";
import { getMyProfile } from "@/modules/profile/queries";
import { requireMembership } from "@/server/auth";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const membership = await requireMembership();
  const [profile, unreadNotifications] = await Promise.all([
    getMyProfile(),
    // O sino é secundário: se a contagem falhar, o app segue sem o selo.
    getUnreadNotificationCount().catch(() => null),
  ]);

  return (
    <SidebarProvider>
      <SkipLink />
      <AppSidebar familyName={membership.familyName} />
      <SidebarInset
        id="conteudo"
        tabIndex={-1}
        className="min-w-0 outline-none"
      >
        <AppHeader
          displayName={profile.displayName}
          email={profile.email}
          avatarUrl={profile.avatarUrl}
          unreadNotifications={unreadNotifications}
        />
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 md:px-6 md:pb-8">
          {children}
        </div>
        <BottomNav />
      </SidebarInset>
    </SidebarProvider>
  );
}
