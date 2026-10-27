"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { Logo } from "@/components/shared/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { isNavItemActive, navItems } from "@/config/navigation";

const LG_QUERY = "(min-width: 1024px)";

/** Expandida a partir de `lg`; recolhida em ícones entre `md` e `lg`. */
function useCollapseBelowLg() {
  const { setOpen } = useSidebar();
  const setOpenRef = useRef(setOpen);

  useEffect(() => {
    setOpenRef.current = setOpen;
  }, [setOpen]);

  useEffect(() => {
    const mql = window.matchMedia(LG_QUERY);
    const sync = () => setOpenRef.current(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
}

export function AppSidebar({ familyName }: { familyName: string }) {
  const pathname = usePathname();
  useCollapseBelowLg();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-sidebar-border h-16 justify-center border-b px-4">
        <Link
          href="/inicio"
          aria-label="Núcleo, ir para o início"
          className="focus-visible:ring-sidebar-ring flex items-center rounded-md outline-none focus-visible:ring-2"
        >
          <Logo
            variant="full"
            className="group-data-[collapsible=icon]:hidden"
          />
          <Logo
            variant="mark"
            className="hidden group-data-[collapsible=icon]:inline-flex"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Navegação principal">
              {navItems.map((item) => {
                const { href, label, icon: Icon } = item;
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      size="lg"
                      tooltip={label}
                      isActive={isNavItemActive(item, pathname)}
                      render={<Link href={href} />}
                    >
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border border-t group-data-[collapsible=icon]:hidden">
        <p className="text-muted-foreground truncate px-2 text-xs">Família</p>
        <p className="truncate px-2 text-sm font-medium">{familyName}</p>
      </SidebarFooter>
    </Sidebar>
  );
}
