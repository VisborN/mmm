/* eslint-disable @typescript-eslint/no-explicit-any */

import {TinkoffOperation} from './tinkoff_operation'

export enum OperationType {
  Credit = "credit",
  Debit = "debit",
  CreditCash = "creditCash",
}

export interface Operation {
  id: string;
  time: Date;
  type: OperationType;
  originAmount: number;
  accountAmount: number;
  from?: string;
  to?: string;
  description: string;

  rawOperationSource?: Record<string, any>;
  tinkoffOperationSource?: TinkoffOperation; // Assumes the interface from the previous snippet
  count: boolean;
  show: boolean;
}

export class OperationMapper {
  /**
   * Replicates the Dart Operation.fromTinkoff named constructor
   */
  static fromTinkoff(tinkoffOp: TinkoffOperation): Operation {
    const typeMap: Record<string, OperationType> = {
      Debit: OperationType.Debit,
      Credit: OperationType.Credit,
    };

    const type = typeMap[tinkoffOp.type || ""] ?? OperationType.Debit;

    const op: Operation = {
      id: `${tinkoffOp.authorizationId ?? tinkoffOp.id}@tinkoff`,
      time: new Date(tinkoffOp.operationTime.milliseconds),
      type: type,
      originAmount: tinkoffOp.amount.value,
      accountAmount: tinkoffOp.accountAmount.value,
      description: tinkoffOp.description,
      rawOperationSource: tinkoffOp, // In JS/TS, object is already a Map-like structure
      tinkoffOperationSource: tinkoffOp,
      count: true,
      show: true,
    };

    // Logic for DEBIT
    if (type === OperationType.Debit) {
      op.from = tinkoffOp.account;
      const fields = tinkoffOp.payment?.fieldsValues;
      if (fields?.pointer) {
        op.to = fields.pointer;
      } else if (fields?.bankCard) {
        op.to = fields.bankCard;
      }
    }

    // Logic for CREDIT
    if (type === OperationType.Credit) {
      op.to = tinkoffOp.account;
      if (tinkoffOp.payment?.cardNumber) {
        op.from = tinkoffOp.payment.cardNumber;
      } else if (tinkoffOp.subgroup?.id === "C10" || tinkoffOp.subgroup?.id === "C4") {
        op.from = tinkoffOp.senderDetails;
      }
    }

    // Visibility rules
    if (tinkoffOp.idSourceType === "External") {
      op.count = false;
      op.show = false;
    }

    return op;
  }
}

/**
 * Merges new operations into oldOperations list in-place.
 */
export function mergeOperations(
  oldOperations: Operation[],
  newOperations: Operation[]
): void {
  // Create an ID lookup map
  const oldIDs: Record<string, number> = {};
  oldOperations.forEach((op, index) => {
    oldIDs[op.id] = index;
  });

  // Filter out duplicates and update existing records
  const filteredNewOps = newOperations.filter((op) => {
    if (Object.prototype.hasOwnProperty.call(oldIDs, op.id)) {
      oldOperations[oldIDs[op.id]] = op;
      return false; // Remove from the 'new' list because it's already updated in 'old'
    }
    return true;
  });

  // Insertion sort for the remaining unique new operations
  let j = 0;
  for (let i = 0; i <= oldOperations.length && j < filteredNewOps.length; i++) {
    const isAtEnd = i === oldOperations.length;

    // Comparison: Dart's !isBefore is equivalent to >=
    if (isAtEnd || filteredNewOps[j].time.getTime() >= oldOperations[i].time.getTime()) {
      oldOperations.splice(i, 0, filteredNewOps[j]);
      j++;
    }
  }
}