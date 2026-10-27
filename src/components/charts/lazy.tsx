"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/** Única porta de entrada das telas: o Recharts só entra no bundle de quem usa. */
export const LazyDonutChart = dynamic(() => import("./donut-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-56 w-full" />,
});

export const LazyCashFlowBarChart = dynamic(
  () => import("./cash-flow-bar-chart"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-56 w-full" />,
  },
);
