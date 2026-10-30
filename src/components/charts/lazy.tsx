"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/** Única porta de entrada das telas: o Recharts só entra no bundle de quem usa. */
// `lg:flex-1` é no-op fora de um pai flex; no painel do /inicio o esqueleto ocupa a altura que sobra.
export const LazyDonutChart = dynamic(() => import("./donut-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-56 w-full lg:min-h-48 lg:flex-1" />,
});

export const LazyHorizontalBarChart = dynamic(
  () => import("./horizontal-bar-chart"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-56 w-full" />,
  },
);

export const LazyCommitmentBarChart = dynamic(
  () => import("./commitment-bar-chart"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-72 w-full lg:min-h-60 lg:flex-1" />,
  },
);

export const LazyCashFlowBarChart = dynamic(
  () => import("./cash-flow-bar-chart"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-56 w-full" />,
  },
);
