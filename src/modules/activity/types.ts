import type { ISODate } from "@/lib/dates";
import type { ActivityGroup, ActivityPageSize } from "./constants";

export type ActivityFilters = {
  grupo?: ActivityGroup;
  de?: ISODate;
  ate?: ISODate;
  pagina: number;
  por_pagina: ActivityPageSize;
};

export type AuditEventRow = {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  /** `null` = sistema; perfil ilegível (ex-integrante) vem como `null` e vira "Ex-integrante". */
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
};

export type ActivityItem = {
  id: string;
  createdAt: string;
  actor: string;
  title: string;
  detail: string | null;
  href: string | null;
};

export type ActivityPage = {
  items: ActivityItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
