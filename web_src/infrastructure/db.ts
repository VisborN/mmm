
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Account, BankOperation, Transaction } from '../domain/types';

export const DB_VERSION = 6;

export interface MoneyAppDB extends DBSchema {
    transactions: {
        key: string;
        value: Transaction;
        indexes: { 'by-date': string, 'by-account': string };
    };
    accounts: {
        key: number;
        value: Account;
    };
    bank_operations: {
        key: string;
        value: BankOperation;
        indexes: { 'by-bank': string; 'by-time': number; 'by-account': string };
    };
}

let dbPromise: Promise<IDBPDatabase<MoneyAppDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MoneyAppDB>> {
    if (!dbPromise) {
        dbPromise = openDB<MoneyAppDB>('money-management-app', DB_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion > 0 && oldVersion < 5) {
                    const existingStores = Array.from(db.objectStoreNames);
                    for (const store of existingStores) {
                        db.deleteObjectStore(store);
                    }
                }
                if (!db.objectStoreNames.contains('transactions')) {
                    const txStore = db.createObjectStore('transactions', { keyPath: 'uuid' });
                    txStore.createIndex('by-date', 'date');
                    txStore.createIndex('by-account', 'accountName');
                }
                if (!db.objectStoreNames.contains('accounts')) {
                    db.createObjectStore('accounts', { keyPath: 'id', autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('bank_operations')) {
                    const bankStore = db.createObjectStore('bank_operations', { keyPath: 'id' });
                    bankStore.createIndex('by-bank', 'bank');
                    bankStore.createIndex('by-time', 'operationTime');
                    bankStore.createIndex('by-account', 'bankAccountId');
                }
            },
        });
    }
    return dbPromise;
}
