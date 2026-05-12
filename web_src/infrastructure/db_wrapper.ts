import "ts-error-as-value/lib/globals";
import { getDB, MoneyAppDB } from "./db";
import { err, Result } from "ts-error-as-value";
import { IDBPDatabase } from "idb";

export async function withDB<T>(operation: (db: IDBPDatabase<MoneyAppDB>) => Promise<T>): Promise<Result<T, Error>> {
    const { data: db, error: dbErr } = await withResult(getDB)();
    if (dbErr) return err(new AggregateError([dbErr], "failed to open database"));

    const { data, error: opErr } = await withResult(operation)(db);
    if (opErr) return err(new AggregateError([opErr], "database operation failed"));

    return ok(data);
}
