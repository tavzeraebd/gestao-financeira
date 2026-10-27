import type { z } from "zod";
import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type { BillKind } from "@/modules/bills/constants";
import type {
  CategoryColor,
  CategoryIconName,
} from "@/modules/categories/constants";
import type { Frequency, RecurrenceState } from "./constants";
import type { recurrenceFiltersSchema } from "./schemas";

export type { Frequency, RecurrenceState };

/** Filtros já normalizados (saída do schema tolerante). */
export type RecurrenceFilters = z.output<typeof recurrenceFiltersSchema>;

export type RecurrenceView = {
  id: string;
  kind: BillKind;
  description: string;
  amount: Cents;
  frequency: Frequency;
  intervalCount: number;
  startDate: ISODate;
  endDate: ISODate | null;
  /** Rótulo da agenda (`frequencyLabel`). */
  label: string;
  nextOccurrence: ISODate | null;
  state: RecurrenceState;
  attention: { code: string; message: string } | null;
  account: { id: string; name: string };
  category: {
    id: string;
    name: string;
    color: CategoryColor;
    icon: CategoryIconName;
  };
  assignedMember: { id: string; displayName: string | null } | null;
  canManage: boolean;
};
