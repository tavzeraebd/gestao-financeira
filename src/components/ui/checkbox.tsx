"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer group/checkbox text-primary-foreground before:border-input data-checked:before:border-primary data-checked:before:bg-primary dark:before:bg-input/30 dark:data-checked:before:bg-primary focus-visible:before:border-ring focus-visible:before:ring-ring aria-invalid:before:border-destructive aria-invalid:before:ring-destructive/20 aria-invalid:aria-checked:before:border-primary dark:aria-invalid:before:border-destructive/50 dark:aria-invalid:before:ring-destructive/40 group-has-[:focus-visible]/field-label:not-data-checked:before:border-input group-has-[:focus-visible]/field-label:data-checked:before:border-primary relative isolate -m-3 flex size-10 shrink-0 items-center justify-center transition-colors outline-none group-has-disabled/field:opacity-50 before:absolute before:inset-3 before:-z-10 before:rounded-[4px] before:border before:transition-colors group-has-[:focus-visible]/field-label:before:ring-0 focus-visible:before:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:before:ring-3",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
