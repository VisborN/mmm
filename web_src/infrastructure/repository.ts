import "ts-error-as-value/lib/globals";
import { getDB } from "./db";
import { Account, Transaction } from "../domain/types";

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
        const { data: db, error: dbErr } = await withResult(getDB)();
        if (dbErr) return err(new AggregateError([dbErr], "failed to open database"));

        const { data: transactions, error: txErr } = await withResult(() => db!.getAllFromIndex('transactions', 'by-date'))();
        if (txErr) return err(new AggregateError([txErr], "failed to get transactions"));

        // Return sorted by date descending
        transactions!.sort((a: Transaction, b: Transaction) => b.date.localeCompare(a.date));
        return ok(transactions!);
    },

    async getTransaction(id: string): Promise<Result<Transaction | undefined, Error>> {
        const { data: db, error: dbErr } = await withResult(getDB)();
        if (dbErr) return err(new AggregateError([dbErr], "failed to open database"));

        const { data: transaction, error: txErr } = await withResult(() => db!.get('transactions', id))();
        if (txErr) return err(new AggregateError([txErr], `failed to get transaction with id ${id}`));

        return ok(transaction);
    },

    async saveTransaction(transaction: Transaction): Promise<Result<void, Error>> {
        const { data: db, error: dbErr } = await withResult(getDB)();
        if (dbErr) return err(new AggregateError([dbErr], "failed to open database"));

        const { error: txErr } = await withResult(() => db!.put('transactions', transaction))();
        if (txErr) return err(new AggregateError([txErr], `failed to save transaction with id ${transaction.id}`));

        return ok<void>(undefined);
    },

    async deleteTransaction(id: string): Promise<Result<void, Error>> {
        const { data: db, error: dbErr } = await withResult(getDB)();
        if (dbErr) return err(new AggregateError([dbErr], "failed to open database"));

        const { error: txErr } = await withResult(() => db!.delete('transactions', id))();
        if (txErr) return err(new AggregateError([txErr], `failed to delete transaction with id ${id}`));

        return ok<void>(undefined);
    },

    async getAccounts(): Promise<Result<Account[], Error>> {
        const { data: db, error: dbErr } = await withResult(getDB)();
        if (dbErr) return err(new AggregateError([dbErr], "failed to open database"));

        const { data: accounts, error: accErr } = await withResult(() => db!.getAll('accounts'))();
        if (accErr) return err(new AggregateError([accErr], "failed to get accounts"));

        return ok(accounts!);
    },

    async getAccount(id: string): Promise<Result<Account | undefined, Error>> {
        const { data: db, error: dbErr } = await withResult(getDB)();
        if (dbErr) return err(new AggregateError([dbErr], "failed to open database"));

        const { data: account, error: accErr } = await withResult(() => db!.get('accounts', id))();
        if (accErr) return err(new AggregateError([accErr], `failed to get account with id ${id}`));

        return ok(account);
    },

    async saveAccount(account: Account): Promise<Result<void, Error>> {
        const { data: db, error: dbErr } = await withResult(getDB)();
        if (dbErr) return err(new AggregateError([dbErr], "failed to open database"));

        const { error: accErr } = await withResult(() => db!.put('accounts', account))();
        if (accErr) return err(new AggregateError([accErr], `failed to save account with id ${account.id}`));

        return ok<void>(undefined);
    },

    async deleteAccount(id: string): Promise<Result<void, Error>> {
        const { data: db, error: dbErr } = await withResult(getDB)();
        if (dbErr) return err(new AggregateError([dbErr], "failed to open database"));

        const { error: accErr } = await withResult(() => db!.delete('accounts', id))();
        if (accErr) return err(new AggregateError([accErr], `failed to delete account with id ${id}`));

        return ok<void>(undefined);
    }
};
