"use client";

import { LogOutIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/modules/auth/actions";

type UserMenuProps = {
  displayName: string;
  email: string;
  avatarUrl: string | null;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** WCAG 2.5.3: o nome acessível começa pelo texto visível (as iniciais). */
export function userMenuLabel(displayName: string): string {
  return `${initialsOf(displayName)}, menu de ${displayName}`;
}

export function UserMenu({ displayName, email, avatarUrl }: UserMenuProps) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={userMenuLabel(displayName)}
        className="focus-visible:ring-ring flex size-10 items-center justify-center rounded-full outline-none focus-visible:ring-3"
      >
        <Avatar>
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback>{initialsOf(displayName)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="text-foreground truncate text-sm font-medium">
              {displayName}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/configuracoes" />}>
          <SettingsIcon aria-hidden="true" />
          Configurações
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await signOut();
            })
          }
        >
          <LogOutIcon aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
