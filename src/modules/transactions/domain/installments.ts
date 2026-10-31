import { addMonths, type ISODate } from "@/lib/dates";
import { allocate, type Cents } from "@/lib/money";
import {
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
} from "@/modules/transactions/constants";

export type InstallmentPreview = {
  number: number;
  date: ISODate;
  amount: Cents;
};

/**
 * D23: prévia da compra parcelada, igual ao que a RPC `create_installment_purchase` grava.
 * Valores = D13 com pesos iguais (a sobra vai 1 centavo a 1 às primeiras parcelas); parcela k =
 * data da compra + (k − 1) meses, sempre a partir da data original (dia curto vira o último dia,
 * como em `recurrence_occurrence`, sem encadear). Não valida o total (o schema e o banco recusam
 * total < N centavos).
 */
export function previewInstallments(
  total: Cents,
  installments: number,
  purchaseDate: ISODate,
): InstallmentPreview[] {
  if (
    !Number.isInteger(installments) ||
    installments < MIN_INSTALLMENTS ||
    installments > MAX_INSTALLMENTS
  ) {
    throw new RangeError(
      `Informe de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas.`,
    );
  }
  return allocate(total, "equal", installments).map((amount, index) => ({
    number: index + 1,
    date: addMonths(purchaseDate, index),
    amount,
  }));
}
