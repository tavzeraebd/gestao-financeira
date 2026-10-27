"use client";

import { CalendarIcon } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { DateLib } from "react-day-picker";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addDays,
  compareISODate,
  formatDateBR,
  isISODate,
  isoToLocalDate,
  localDateToISO,
  type ISODate,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  id: string;
  /** `YYYY-MM-DD`, ou vazio. */
  value: string;
  onChange: (value: string) => void;
  /** Data civil de hoje (`today()` de `@/lib/dates`), vinda do servidor para evitar divergência. */
  today: ISODate;
  min?: ISODate;
  max?: ISODate;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
};

function labelFor(value: string, today: ISODate): string {
  if (!isISODate(value)) return "Selecionar data";
  if (value === today) return "Hoje";
  if (value === addDays(today, -1)) return "Ontem";
  return formatDateBR(value);
}

export function DatePicker({
  id,
  value,
  onChange,
  today,
  min,
  max,
  disabled,
  className,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const yesterday = addDays(today, -1);
  const selected = isISODate(value) ? isoToLocalDate(value) : undefined;

  const isOutside = (d: ISODate) =>
    (min !== undefined && compareISODate(d, min) < 0) ||
    (max !== undefined && compareISODate(d, max) > 0);

  function choose(d: ISODate) {
    onChange(d);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={aria["aria-invalid"]}
            aria-describedby={aria["aria-describedby"]}
            className={cn(
              "aria-invalid:border-destructive aria-invalid:ring-destructive/20 w-full justify-start font-normal aria-invalid:ring-3",
              !selected && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon aria-hidden="true" data-icon="inline-start" />
        <span className="tabular-nums">{labelFor(value, today)}</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto gap-2 p-2"
        // Foco inicial no dia (selecionado, ou hoje): sem isso o react-day-picker não tem dia
        // focado e as setas não fazem nada. Esc fecha e o Base UI devolve o foco ao gatilho.
        initialFocus={() =>
          calendarRef.current?.querySelector<HTMLElement>(
            "button[data-day][tabindex='0']",
          ) ?? true
        }
      >
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={isOutside(today)}
            onClick={() => choose(today)}
          >
            Hoje
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={isOutside(yesterday)}
            onClick={() => choose(yesterday)}
          >
            Ontem
          </Button>
        </div>
        <div ref={calendarRef}>
          <Calendar
            autoFocus
            mode="single"
            locale={ptBR}
            today={isoToLocalDate(today)}
            labels={{
              labelPrevious: () => "Mês anterior",
              labelNext: () => "Próximo mês",
              labelDayButton: (date, modifiers, options, dateLib) => {
                let label = (dateLib ?? new DateLib(options)).format(
                  date,
                  "PPPP",
                );
                if (modifiers.today) label = `Hoje, ${label}`;
                if (modifiers.selected) label = `${label}, selecionado`;
                return label;
              },
            }}
            selected={selected}
            defaultMonth={
              selected ??
              isoToLocalDate(
                max && compareISODate(today, max) > 0 ? max : today,
              )
            }
            onSelect={(date) => {
              if (date) choose(localDateToISO(date));
            }}
            disabled={[
              ...(min ? [{ before: isoToLocalDate(min) }] : []),
              ...(max ? [{ after: isoToLocalDate(max) }] : []),
            ]}
            className="[--cell-size:--spacing(10)]"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
