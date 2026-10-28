"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Ocultar senha" : "Mostrar senha";

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        aria-label={label}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-3"
      >
        {visible ? (
          <EyeOffIcon aria-hidden="true" className="size-4" />
        ) : (
          <EyeIcon aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}
