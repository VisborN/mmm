
import "ts-error-as-value/lib/globals";
import { Account, Transaction } from "../domain/types";
import { withDB } from "./db_wrapper";

export interface Repository {
    getTransactions(): Promise<Result<Transaction[], Error>>;
    getTransaction(id: number): Promise<Result<Transaction | undefined, Error>>;
    saveTransaction(transaction: Transaction): Promise<Result<void, Error>>;
    deleteTransaction(id: number): Promise<Result<void, Error>>;

    getAccounts(): Promise<Result<Account[], Error>>;
    getAccount(id: number): Promise<Result<Account | undefined, Error>>;
    saveAccount(account: Account): Promise<Result<void, Error>>;
    deleteAccount(id: number): Promise<Result<void, Error>>;
    replaceAllTransactions(transactions: Transaction[]): Promise<Result<void, Error>>;
}

export const indexedDBRepository: Repository = {
    async replaceAllTransactions(transactions: Transaction[]): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            const tx = db.transaction('transactions', 'readwrite');
            await tx.store.clear();

            // Sort by date ascending, then by old ID ascending
            // This ensures that when we insert them and they get new auto-incrementing IDs,
            // the relative order within the same day is preserved.
            const sorted = [...transactions].sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.id - b.id;
            });

            for (const t of sorted) {
                const data = { ...t };
                if (!data.uuid) data.uuid = crypto.randomUUID();
                delete (data as { id?: number }).id;
                await tx.store.add(data as unknown as Transaction);
            }
            await tx.done;
        });
        if (result.error) return result;
        return ok<void>(undefined);
    },
    async getTransactions(): Promise<Result<Transaction[], Error>> {
        const result = await withDB<Transaction[]>(db => db.getAllFromIndex('transactions', 'by-date'));
        if (result.error) return result;

        // Sort by date descending, then ID descending
        result.data!.sort((a: Transaction, b: Transaction) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return b.id - a.id;
        });
        return ok(result.data);
    },
    async getTransaction(id: number): Promise<Result<Transaction | undefined, Error>> {
        return withDB<Transaction | undefined>(db => db.get('transactions', id));
    },
    async saveTransaction(transaction: Transaction): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            if (!transaction.uuid) {
                transaction.uuid = crypto.randomUUID();
            }
            if (transaction.id === 0) {
                // For new transactions, we let IndexedDB generate the ID.
                const data = { ...transaction };
                delete (data as { id?: number }).id;
                await db.add('transactions', data as unknown as Transaction);
            } else {
                await db.put('transactions', transaction);
            }
        });
        if (result.error) return result;
        return ok<void>(undefined);
    },

    async deleteTransaction(id: number): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            await db.delete('transactions', id);
        });
        if (result.error) return result;
        return ok<void>(undefined);
    },

    async getAccounts(): Promise<Result<Account[], Error>> {
        return withDB<Account[]>(db => db.getAll('accounts'));
    },

    async getAccount(id: number): Promise<Result<Account | undefined, Error>> {
        return withDB<Account | undefined>(db => db.get('accounts', id));
    },

    async saveAccount(account: Account): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            if (account.id === 0) {
                // For new accounts, we let IndexedDB generate the ID.
                const data = { ...account };
                delete (data as { id?: number }).id;
                await db.add('accounts', data as unknown as Account);
            } else {
                await db.put('accounts', account);
            }
        });
        if (result.error) return result;
        return ok<void>(undefined);
    },

    async deleteAccount(id: number): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            await db.delete('accounts', id);
        });
        if (result.error) return result;
        return ok<void>(undefined);
    }
};
