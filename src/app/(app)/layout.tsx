import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getMyProfile } from "@/modules/profile/queries";
import { requireMembership } from "@/server/auth";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const membership = await requireMembership();
  const profile = await getMyProfile();

  return (
    <SidebarProvider>
      <AppSidebar familyName={membership.familyName} />
      <SidebarInset className="min-w-0">
        <AppHeader
          displayName={profile.displayName}
          email={profile.email}
          avatarUrl={profile.avatarUrl}
        />
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 md:px-6 md:pb-8">
          {children}
        </div>
        <BottomNav />
      </SidebarInset>
    </SidebarProvider>
  );
}
