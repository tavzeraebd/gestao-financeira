"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch data-checked:before:bg-primary data-unchecked:before:bg-input dark:data-unchecked:before:bg-input/80 focus-visible:before:border-ring focus-visible:before:ring-ring aria-invalid:before:border-destructive aria-invalid:before:ring-destructive/20 dark:aria-invalid:before:border-destructive/50 dark:aria-invalid:before:ring-destructive/40 relative isolate inline-flex shrink-0 items-center rounded-full outline-none before:absolute before:inset-x-0 before:top-1/2 before:-z-10 before:-translate-y-1/2 before:rounded-full before:border before:border-transparent before:transition-all group-has-[:focus-visible]/field-label:before:border-transparent group-has-[:focus-visible]/field-label:before:ring-0 focus-visible:before:ring-3 aria-invalid:before:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=default]:-my-[10.8px] data-[size=default]:h-10 data-[size=default]:w-[32px] data-[size=default]:before:h-[18.4px] data-[size=sm]:-my-[13px] data-[size=sm]:h-10 data-[size=sm]:w-[24px] data-[size=sm]:before:h-[14px]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="bg-background dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground pointer-events-none block rounded-full ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
