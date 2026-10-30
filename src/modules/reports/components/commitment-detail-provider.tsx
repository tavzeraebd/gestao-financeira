"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CommitmentDetails } from "@/modules/reports/types";

import { CommitmentDetailBody } from "./commitment-detail-body";
import { describeView, type DetailView } from "./commitment-detail-views";

type DetailContextValue = { open: (view: DetailView) => void };

const DetailContext = createContext<DetailContextValue | null>(null);

/** `null` fora do provedor: quem chama deve renderizar o conteúdo sem interação. */
export function useCommitmentDetail(): DetailContextValue | null {
  return useContext(DetailContext);
}

/**
 * Guarda a visão aberta e mostra o detalhamento num diálogo. Os dados já vêm do servidor; abrir não consulta
 * nada.
 */
export function CommitmentDetailProvider({
  details,
  children,
}: {
  details: CommitmentDetails;
  children: ReactNode;
}) {
  const [view, setView] = useState<DetailView | null>(null);
  const value = useMemo(() => ({ open: setView }), []);
  const text = view ? describeView(details, view) : null;

  return (
    <DetailContext.Provider value={value}>
      {children}
      <Dialog
        open={view !== null}
        onOpenChange={(next) => {
          if (!next) setView(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          data-testid="detalhamento"
          className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[calc(100%-1rem)] flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <DialogHeader className="gap-1 border-b p-4">
            <DialogTitle className="text-lg leading-snug">
              {text?.title}
            </DialogTitle>
            <DialogDescription>{text?.description}</DialogDescription>
          </DialogHeader>
          <div className={cn("min-h-0 flex-1 overflow-y-auto p-4")}>
            {view ? (
              <CommitmentDetailBody details={details} view={view} />
            ) : null}
          </div>
          <DialogFooter className="mx-0 mb-0">
            <DialogClose render={<Button variant="outline" />}>
              Fechar
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailContext.Provider>
  );
}

/**
 * Botão que abre um detalhamento. Fora do provedor (ex.: testes de um card isolado) renderiza só o conteúdo.
 * Barras de gráfico SVG não têm teclado: por isso o mês também aparece como botão na tabela e na fileira de meses.
 */
export function DetailTrigger({
  view,
  className,
  children,
  "aria-label": ariaLabel,
  ...rest
}: {
  view: DetailView;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  const detail = useCommitmentDetail();
  if (!detail) {
    return <span className={className}>{children}</span>;
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => detail.open(view)}
      className={cn(
        "focus-visible:ring-ring cursor-pointer rounded-md outline-none focus-visible:ring-3",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
