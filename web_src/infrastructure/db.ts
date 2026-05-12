import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Account, Transaction } from '../domain/types';

interface MoneyAppDB extends DBSchema {
    transactions: {
        key: string;
        value: Transaction;
        indexes: { 'by-date': string, 'by-account': string };
    };
    accounts: {
        key: string;
        value: Account;
    };
}

let dbPromise: Promise<IDBPDatabase<MoneyAppDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MoneyAppDB>> {
    if (!dbPromise) {
        dbPromise = openDB<MoneyAppDB>('money-management-app', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('transactions')) {
                    const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
                    txStore.createIndex('by-date', 'date');
                    txStore.createIndex('by-account', 'accountId');
                }
                if (!db.objectStoreNames.contains('accounts')) {
                    db.createObjectStore('accounts', { keyPath: 'id' });
                }
            },
        });
    }
    return dbPromise;
}
