import { z } from "zod";
import {
  enumParam,
  pageParam,
  paramsObject,
} from "@/lib/validation/url-params";
import { DEFAULT_NOTIFICATION_TAB, NOTIFICATION_TAB_KEYS } from "./constants";
import type { NotificationFilters } from "./types";

export const notificationIdSchema = z.object({
  notificationId: z.uuid("Notificação inválida."),
});

/** URL tolerante: `aba` (`todas` padrão) e `pagina`; valor inválido vira o padrão, nunca erro. */
export const notificationFiltersSchema = z
  .unknown()
  .transform((raw): NotificationFilters => {
    const source = paramsObject(raw);
    return {
      aba:
        enumParam(source.aba, NOTIFICATION_TAB_KEYS) ??
        DEFAULT_NOTIFICATION_TAB,
      pagina: pageParam(source.pagina),
    };
  });
