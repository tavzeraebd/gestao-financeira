"use client";

import { SearchIcon, XIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = Omit<ComponentProps<"input">, "type"> & {
  onClear: () => void;
};

export function SearchInput({
  onClear,
  className,
  value,
  disabled,
  ...props
}: SearchInputProps) {
  const hasText = typeof value === "string" ? value.length > 0 : Boolean(value);
  return (
    <div className="relative w-full">
      <SearchIcon
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        {...props}
        type="search"
        value={value}
        disabled={disabled}
        className={cn(
          "pl-9 [&::-webkit-search-cancel-button]:appearance-none",
          hasText && "pr-11",
          className,
        )}
      />
      {hasText && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Limpar busca"
          className="absolute top-0 right-0"
          onClick={onClear}
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
