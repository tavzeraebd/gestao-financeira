import { z } from "zod";
import { compareISODate } from "@/lib/dates";
import {
  dateParam,
  enumParam,
  firstParam,
  pageParam,
  paramsObject,
} from "@/lib/validation/url-params";
import {
  ACTIVITY_GROUP_KEYS,
  ACTIVITY_PAGE_SIZES,
  DEFAULT_ACTIVITY_PAGE_SIZE,
  type ActivityPageSize,
} from "./constants";
import type { ActivityFilters } from "./types";

/** URL tolerante: valor inválido vira o padrão; `de > ate` descarta o período. */
export const activityFiltersSchema = z
  .unknown()
  .transform((raw): ActivityFilters => {
    const source = paramsObject(raw);
    const size = Number(firstParam(source.por_pagina));
    const pageSize = (ACTIVITY_PAGE_SIZES as readonly number[]).includes(size)
      ? (size as ActivityPageSize)
      : DEFAULT_ACTIVITY_PAGE_SIZE;
    const filters: ActivityFilters = {
      pagina: pageParam(source.pagina),
      por_pagina: pageSize,
    };
    const grupo = enumParam(source.grupo, ACTIVITY_GROUP_KEYS);
    if (grupo) filters.grupo = grupo;
    const de = dateParam(source.de);
    const ate = dateParam(source.ate);
    if (de && ate && compareISODate(de, ate) > 0) return filters;
    if (de) filters.de = de;
    if (ate) filters.ate = ate;
    return filters;
  });
