
import "ts-error-as-value/lib/globals";
import { Account, Transaction } from "../domain/types";
import { withDB } from "./db_wrapper";

export interface Repository {
    getTransactions(): Promise<Result<Transaction[], Error>>;
    getTransaction(id: string): Promise<Result<Transaction | undefined, Error>>;
    saveTransaction(transaction: Transaction): Promise<Result<void, Error>>;
    deleteTransaction(id: string): Promise<Result<void, Error>>;

    getAccounts(): Promise<Result<Account[], Error>>;
    getAccount(id: string): Promise<Result<Account | undefined, Error>>;
    saveAccount(account: Account): Promise<Result<void, Error>>;
    deleteAccount(id: string): Promise<Result<void, Error>>;
}

export const indexedDBRepository: Repository = {
    async getTransactions(): Promise<Result<Transaction[], Error>> {
        const result = await withDB<Transaction[]>(db => db.getAllFromIndex('transactions', 'by-date'));
        if (result.error) return result;

        result.data!.sort((a: Transaction, b: Transaction) => b.date.localeCompare(a.date));
        return ok(result.data);
    },

    async getTransaction(id: string): Promise<Result<Transaction | undefined, Error>> {
        return withDB<Transaction | undefined>(db => db.get('transactions', id));
    },

    async saveTransaction(transaction: Transaction): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            await db.put('transactions', transaction);
        });
        if (result.error) return result.error;
        return ok<void>(undefined);
    },

    async deleteTransaction(id: string): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            await db.delete('transactions', id);
        });
        if (result.error) return result.error;
        return ok<void>(undefined);
    },

    async getAccounts(): Promise<Result<Account[], Error>> {
        return withDB<Account[]>(db => db.getAll('accounts'));
    },

    async getAccount(id: string): Promise<Result<Account | undefined, Error>> {
        return withDB<Account | undefined>(db => db.get('accounts', id));
    },

    async saveAccount(account: Account): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            await db.put('accounts', account);
        });
        if (result.error) return result.error;
        return ok<void>(undefined);
    },

    async deleteAccount(id: string): Promise<Result<void, Error>> {
        const result = await withDB(async db => {
            await db.delete('accounts', id);
        });
        if (result.error) return result.error;
        return ok<void>(undefined);
    }
};
