
import "ts-error-as-value/lib/globals";
import { Account, Transaction } from "../domain/types";
import { uuidv7 } from "../domain/uuidv7";
import { withDB } from "./db_wrapper";

export interface Repository {
    getTransactions(): Promise<Result<Transaction[], Error>>;
    getTransaction(uuid: string): Promise<Result<Transaction | undefined, Error>>;
    saveTransaction(transaction: Transaction): Promise<Result<void, Error>>;
    deleteTransaction(uuid: string): Promise<Result<void, Error>>;
    clearTransactions(): Promise<Result<void, Error>>;

    getAccounts(): Promise<Result<Account[], Error>>;
    getAccount(id: number): Promise<Result<Account | undefined, Error>>;
    saveAccount(account: Account): Promise<Result<void, Error>>;
    deleteAccount(id: number): Promise<Result<void, Error>>;
    clearAccounts(): Promise<Result<void, Error>>;
    resetAccountBalances(): Promise<Result<void, Error>>;

    replaceAllTransactions(transactions: Transaction[]): Promise<Result<void, Error>>;
    clearAllData(): Promise<Result<void, Error>>;
}

export const indexedDBRepository: Repository = {
    async replaceAllTransactions(transactions: Transaction[]): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            const tx = db.transaction('transactions', 'readwrite');
            await tx.store.clear();

            for (const t of transactions) {
                const data = { ...t };
                if (!data.uuid) data.uuid = uuidv7();
                await tx.store.put(data);
            }
            await tx.done;
        });
        if (result.error) return result;
        return ok<void>(undefined);
    },
    async getTransactions(): Promise<Result<Transaction[], Error>> {
        const result = await withDB<Transaction[]>(db => db.getAllFromIndex('transactions', 'by-date'));
        if (result.error) return result;

        // Sort by date descending, then UUIDv7 descending (UUIDv7 is chronological)
        result.data!.sort((a: Transaction, b: Transaction) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return b.uuid.localeCompare(a.uuid);
        });
        return ok(result.data);
    },
    async getTransaction(uuid: string): Promise<Result<Transaction | undefined, Error>> {
        return withDB<Transaction | undefined>(db => db.get('transactions', uuid));
    },
    async saveTransaction(transaction: Transaction): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            if (!transaction.uuid) {
                transaction.uuid = uuidv7();
            }
            await db.put('transactions', transaction);
        });
        if (result.error) return result;
        return ok<void>(undefined);
    },

    async deleteTransaction(uuid: string): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            await db.delete('transactions', uuid);
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
    },

    async clearTransactions(): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            await db.clear('transactions');
        });
        if (result.error) return result;
        return ok<void>(undefined);
    },

    async clearAccounts(): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            await db.clear('accounts');
        });
        if (result.error) return result;
        return ok<void>(undefined);
    },

    async resetAccountBalances(): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            const tx = db.transaction('accounts', 'readwrite');
            const accounts = await tx.store.getAll();
            for (const acc of accounts) {
                acc.balance = '0';
                await tx.store.put(acc);
            }
            await tx.done;
        });
        if (result.error) return result;
        return ok<void>(undefined);
    },

    async clearAllData(): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            const tx = db.transaction(['transactions', 'accounts'], 'readwrite');
            await tx.objectStore('transactions').clear();
            await tx.objectStore('accounts').clear();
            await tx.done;
        });
        if (result.error) return result;
        return ok<void>(undefined);
    }
};
