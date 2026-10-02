import "ts-error-as-value/lib/globals";
import { BankOperation, Transaction, TransactionType } from "./types";
import { uuidv7 } from "./uuidv7";
import { indexedDBRepository } from "../infrastructure/repository";
import { getTBankOperations } from "../infrastructure/tbank";

export interface MergeBankOperationsResult {
  savedBankOps: BankOperation[];
  createdTxs: Transaction[];
  updatedTxs: Transaction[];
  deletedTxUuids: string[];
}

/**
 * Builds mapping of bankAccountId -> MMM accountName based on initial balance_correct transactions.
 * According to architecture: "сопоставление задаётся в первой операции баланса которая создаёт счёт".
 */
export function buildAccountMapping(transactions: Transaction[]): Map<string, string> {
  const mapping = new Map<string, string>();

  // Find all balance_correct transactions with bankOperationIds
  const balanceTxs = transactions.filter(
    (t) => t.type === "balance_correct" && t.bankOperationIds && t.bankOperationIds.length > 0
  );

  // Sort by date ascending to find the earliest (initial) balance_correct per account
  balanceTxs.sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of balanceTxs) {
    for (const rawId of tx.bankOperationIds!) {
      if (!rawId) continue;
      // rawId can be "tbank:0290472137" or "0290472137"
      mapping.set(rawId, tx.accountName);
      if (rawId.startsWith("tbank:")) {
        mapping.set(rawId.slice(6), tx.accountName);
      }
    }
  }

  return mapping;
}

/**
 * Links a bank account to an MMM account in its initial balance_correct transaction.
 */
export async function linkBankAccountToMmmAccount(
  accountName: string,
  bankAccountId: string,
  transactions: Transaction[],
  initialBalance?: string,
  initialCurrency?: string
): Promise<Result<void, Error>> {
  const bankOpId = `tbank:${bankAccountId}`;

  // Find existing balance_correct transactions for this account
  const existingBalanceTxs = transactions.filter(
    (t) => t.accountName === accountName && t.type === "balance_correct"
  );

  if (existingBalanceTxs.length > 0) {
    // Sort ascending to get earliest
    existingBalanceTxs.sort((a, b) => a.date.localeCompare(b.date));
    const earliest = existingBalanceTxs[0];
    const currentIds = earliest.bankOperationIds ? [...earliest.bankOperationIds] : [];
    if (!currentIds.includes(bankOpId) && !currentIds.includes(bankAccountId)) {
      currentIds.push(bankOpId);
      earliest.bankOperationIds = currentIds;
      const saveRes = await indexedDBRepository.saveTransaction(earliest);
      if (saveRes.error) return err(saveRes.error);
    }
    return ok(undefined);
  }

  // Create new initial balance_correct transaction
  const newTx: Transaction = {
    uuid: uuidv7(),
    date: new Date().toISOString().split("T")[0],
    amountRubles: parseFloat(initialBalance || "0") || 0,
    amountAccountCurrency: initialBalance || "0",
    accountName: accountName,
    accountCurrency: initialCurrency || "RUB",
    category: "баланс",
    description: "Начальный баланс (привязка Т-Банк)",
    type: "balance_correct",
    member: null,
    exchangeRate: 1,
    transferReceiveAccountName: null,
    transferReceiveAmountAccountCurrency: null,
    bankOperationIds: [bankOpId],
  };

  const saveRes = await indexedDBRepository.saveTransaction(newTx);
  if (saveRes.error) return err(saveRes.error);
  return ok(undefined);
}

/**
 * Pure transformation and merge logic: compares incoming bank operations against
 * existing transactions and produces sets of operations to save, create, update, or delete.
 */
export function mergeBankOperations(
  incomingOps: BankOperation[],
  existingTransactions: Transaction[],
  accountMapping: Map<string, string>
): MergeBankOperationsResult {
  const savedBankOps: BankOperation[] = [];
  const createdTxs: Transaction[] = [];
  const updatedTxs: Transaction[] = [];
  const deletedTxUuids: string[] = [];

  // Build lookup index: bankOperationId -> Transaction
  const txByBankOpId = new Map<string, Transaction>();
  for (const tx of existingTransactions) {
    if (tx.bankOperationIds) {
      for (const bId of tx.bankOperationIds) {
        txByBankOpId.set(bId, tx);
      }
    }
  }

  for (const bankOp of incomingOps) {
    savedBankOps.push(bankOp);

    const linkedTx = txByBankOpId.get(bankOp.id);

    // If transaction already exists:
    if (linkedTx) {
      if (bankOp.status === "FAILED") {
        // Operation was failed or canceled by bank: delete linked transaction
        if (!deletedTxUuids.includes(linkedTx.uuid)) {
          deletedTxUuids.push(linkedTx.uuid);
        }
        txByBankOpId.delete(bankOp.id);
        continue;
      }

      // Check if amount or date updated
      const newAmountStr = String(bankOp.accountAmount ?? bankOp.amount);
      const newAmountRubles =
        bankOp.currency === "RUB"
          ? bankOp.amount
          : bankOp.accountCurrency === "RUB" && bankOp.accountAmount !== undefined
            ? bankOp.accountAmount
            : bankOp.amount;
      const newDate = new Date(bankOp.operationTime).toISOString().split("T")[0];

      let isChanged = false;
      if (linkedTx.amountAccountCurrency !== newAmountStr) isChanged = true;
      if (linkedTx.amountRubles !== newAmountRubles) isChanged = true;
      if (linkedTx.date !== newDate) isChanged = true;

      if (isChanged) {
        const updated: Transaction = {
          ...linkedTx,
          amountAccountCurrency: newAmountStr,
          amountRubles: newAmountRubles,
          date: newDate,
        };
        updatedTxs.push(updated);
        txByBankOpId.set(bankOp.id, updated);
      }
      continue;
    }

    // Transaction does not exist yet:
    if (bankOp.status === "FAILED") {
      // Failed operations from bank do not generate transactions
      continue;
    }

    // Resolve mapped MMM account
    const accountName =
      accountMapping.get(bankOp.bankAccountId) || accountMapping.get(bankOp.id);
    if (!accountName) {
      // Account is not mapped to MMM account yet; bank operation is preserved in savedBankOps
      continue;
    }

    // Determine transaction type
    let opType: TransactionType = bankOp.type === "Credit" ? "deposit" : "withdraw";
    let transferReceiveAccount: string | null = null;
    let transferReceiveAmount: string | null = null;

    if (bankOp.isInner && bankOp.innerCounterpartId) {
      const counterpartName = accountMapping.get(bankOp.innerCounterpartId);
      if (counterpartName) {
        // Internal transfer between known accounts
        if (bankOp.type === "Debit") {
          opType = "transfer";
          transferReceiveAccount = counterpartName;
          transferReceiveAmount = String(bankOp.accountAmount ?? bankOp.amount);
        }
      }
    }

    const amountAccountCurr = String(bankOp.accountAmount ?? bankOp.amount);
    const amountRub =
      bankOp.currency === "RUB"
        ? bankOp.amount
        : bankOp.accountCurrency === "RUB" && bankOp.accountAmount !== undefined
          ? bankOp.accountAmount
          : bankOp.amount;

    const newTx: Transaction = {
      uuid: uuidv7(),
      date: new Date(bankOp.operationTime).toISOString().split("T")[0],
      amountRubles: amountRub,
      amountAccountCurrency: amountAccountCurr,
      accountName: accountName,
      accountCurrency: bankOp.accountCurrency || bankOp.currency || "RUB",
      category: bankOp.category || (bankOp.type === "Credit" ? "Пополнение" : "Прочее"),
      description: bankOp.description || "",
      type: opType,
      member: null,
      exchangeRate:
        bankOp.accountAmount && bankOp.amount && bankOp.amount !== 0
          ? bankOp.accountAmount / bankOp.amount
          : 1,
      transferReceiveAccountName: transferReceiveAccount,
      transferReceiveAmountAccountCurrency: transferReceiveAmount,
      bankOperationIds: [bankOp.id],
    };

    createdTxs.push(newTx);
    txByBankOpId.set(bankOp.id, newTx);
  }

  return {
    savedBankOps,
    createdTxs,
    updatedTxs,
    deletedTxUuids,
  };
}

export class BankSyncService {
  /**
   * Performs incremental sync for the specified accounts (typically last 35 days).
   */
  async syncIncremental(
    accountIds: string[]
  ): Promise<
    Result<
      {
        syncedOpsCount: number;
        createdTxCount: number;
        updatedTxCount: number;
        deletedTxCount: number;
      },
      Error
    >
  > {
    const end = new Date();
    // 35 days in milliseconds
    const start = new Date(end.getTime() - 35 * 24 * 60 * 60 * 1000);

    const allOps: BankOperation[] = [];
    for (const accId of accountIds) {
      const opsRes = await getTBankOperations({ accountId: accId, start, end });
      if (opsRes.error !== null) {
        return err(
          new AggregateError([opsRes.error], `Failed to fetch operations for account ${accId}`)
        );
      }
      allOps.push(...opsRes.data);
    }

    const txsRes = await indexedDBRepository.getTransactions();
    if (txsRes.error !== null) return err(txsRes.error);
    const existingTxs = txsRes.data || [];

    const accountMapping = buildAccountMapping(existingTxs);
    const mergeResult = mergeBankOperations(allOps, existingTxs, accountMapping);

    // Persist bank operations
    const saveBankRes = await indexedDBRepository.saveBankOperations(mergeResult.savedBankOps);
    if (saveBankRes.error !== null) return err(saveBankRes.error);

    // Apply deletions
    for (const uuid of mergeResult.deletedTxUuids) {
      const delRes = await indexedDBRepository.deleteTransaction(uuid);
      if (delRes.error !== null) return err(delRes.error);
    }

    // Apply updates
    for (const tx of mergeResult.updatedTxs) {
      const saveRes = await indexedDBRepository.saveTransaction(tx);
      if (saveRes.error !== null) return err(saveRes.error);
    }

    // Apply creations
    for (const tx of mergeResult.createdTxs) {
      const saveRes = await indexedDBRepository.saveTransaction(tx);
      if (saveRes.error !== null) return err(saveRes.error);
    }

    return ok({
      syncedOpsCount: allOps.length,
      createdTxCount: mergeResult.createdTxs.length,
      updatedTxCount: mergeResult.updatedTxs.length,
      deletedTxCount: mergeResult.deletedTxUuids.length,
    });
  }

  /**
   * Performs full historical sync back to 2010 month by month with 1-second delay between requests.
   */
  async syncFullHistory(
    accountIds: string[],
    options?: {
      onProgress?: (msg: string, percent?: number) => void;
      shouldAbort?: () => boolean;
    }
  ): Promise<
    Result<
      {
        syncedOpsCount: number;
        createdTxCount: number;
        updatedTxCount: number;
        deletedTxCount: number;
      },
      Error
    >
  > {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth(); // 0-indexed

    const startYear = 2010;
    const startMonth = 0; // January 2010

    const totalMonths = (currentYear - startYear) * 12 + (currentMonth - startMonth) + 1;
    let completedMonths = 0;

    let totalSyncedOps = 0;
    let totalCreatedTxs = 0;
    let totalUpdatedTxs = 0;
    let totalDeletedTxs = 0;

    // Load transactions once at start and keep updated
    const txsRes = await indexedDBRepository.getTransactions();
    if (txsRes.error !== null) return err(txsRes.error);
    let existingTxs = txsRes.data || [];

    let consecutiveEmptyMonths = 0;

    // Iterate backwards month by month
    for (let y = currentYear; y >= startYear; y--) {
      const mStart = y === currentYear ? currentMonth : 11;
      const mEnd = y === startYear ? startMonth : 0;

      for (let m = mStart; m >= mEnd; m--) {
        if (options?.shouldAbort && options.shouldAbort()) {
          return err(new Error("Синхронизация отменена пользователем"));
        }

        const monthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
        // End of month: first day of next month minus 1 millisecond
        const monthEnd =
          y === currentYear && m === currentMonth
            ? now
            : new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0) - 1);

        const monthLabel = monthStart.toLocaleString("ru-RU", { month: "long", year: "numeric" });
        const percent = Math.round((completedMonths / totalMonths) * 100);

        if (options?.onProgress) {
          options.onProgress(
            `Загрузка Т-Банк: ${monthLabel} (загружено ${totalSyncedOps} операций)...`,
            percent
          );
        }

        const batchOps: BankOperation[] = [];

        for (const accId of accountIds) {
          if (options?.shouldAbort && options.shouldAbort()) {
            return err(new Error("Синхронизация отменена пользователем"));
          }

          const opsRes = await getTBankOperations({ accountId: accId, start: monthStart, end: monthEnd });
          if (opsRes.error !== null) {
            return err(
              new AggregateError([opsRes.error], `Failed to fetch operations for ${monthLabel}`)
            );
          }
          batchOps.push(...opsRes.data);

          // 1-second delay between bank API calls to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (batchOps.length === 0) {
          consecutiveEmptyMonths++;
          // If we are before 2020 and have 12 consecutive empty months, we've reached the account opening origin
          if (y < 2020 && consecutiveEmptyMonths >= 12) {
            break;
          }
        } else {
          consecutiveEmptyMonths = 0;
          totalSyncedOps += batchOps.length;

          const accountMapping = buildAccountMapping(existingTxs);
          const mergeResult = mergeBankOperations(batchOps, existingTxs, accountMapping);

          // Save bank operations
          const saveBankRes = await indexedDBRepository.saveBankOperations(mergeResult.savedBankOps);
          if (saveBankRes.error !== null) return err(saveBankRes.error);

          // Apply deletions
          for (const uuid of mergeResult.deletedTxUuids) {
            const delRes = await indexedDBRepository.deleteTransaction(uuid);
            if (delRes.error !== null) return err(delRes.error);
            existingTxs = existingTxs.filter((t) => t.uuid !== uuid);
            totalDeletedTxs++;
          }

          // Apply updates
          for (const tx of mergeResult.updatedTxs) {
            const saveRes = await indexedDBRepository.saveTransaction(tx);
            if (saveRes.error !== null) return err(saveRes.error);
            const idx = existingTxs.findIndex((t) => t.uuid === tx.uuid);
            if (idx !== -1) existingTxs[idx] = tx;
            totalUpdatedTxs++;
          }

          // Apply creations
          for (const tx of mergeResult.createdTxs) {
            const saveRes = await indexedDBRepository.saveTransaction(tx);
            if (saveRes.error !== null) return err(saveRes.error);
            existingTxs.push(tx);
            totalCreatedTxs++;
          }
        }

        completedMonths++;
      }

      // Check if we broke out of inner loop due to consecutive empty months
      if (y < 2020 && consecutiveEmptyMonths >= 12) {
        break;
      }
    }

    if (options?.onProgress) {
      options.onProgress(`Синхронизация завершена: обработано ${totalSyncedOps} операций`, 100);
    }

    return ok({
      syncedOpsCount: totalSyncedOps,
      createdTxCount: totalCreatedTxs,
      updatedTxCount: totalUpdatedTxs,
      deletedTxCount: totalDeletedTxs,
    });
  }

  /**
   * Resets local bank operations for a specific bank.
   */
  async resetBankOperations(bank: string): Promise<Result<void, Error>> {
    const delRes = await indexedDBRepository.deleteBankOperationsByBank(bank);
    if (delRes.error !== null) return err(delRes.error);
    return ok(undefined);
  }
}

export const bankSyncService = new BankSyncService();
