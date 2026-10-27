"use client";

import { LogOutIcon } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/modules/auth/actions";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await signOut();
        })
      }
    >
      {pending ? null : <LogOutIcon aria-hidden="true" />}
      Sair da conta
    </Button>
  );
}
