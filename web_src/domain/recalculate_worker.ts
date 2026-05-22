import { openDB } from 'idb';
import { MoneyAppDB, DB_VERSION } from '../infrastructure/db';
import Big from 'big.js';

// Exact math string functions to preserve precision using big.js
function addStrings(a: string, b: string): string {
    try {
        const bigA = new Big(a || '0');
        const bigB = new Big(b || '0');
        return bigA.plus(bigB).toString();
    } catch {
        return a;
    }
}

function subStrings(a: string, b: string): string {
    try {
        const bigA = new Big(a || '0');
        const bigB = new Big(b || '0');
        return bigA.minus(bigB).toString();
    } catch {
        return a;
    }
}

self.onmessage = async (e: MessageEvent): Promise<void> => {
    if (e.data === 'recalculate') {
        try {
            const db = await openDB<MoneyAppDB>('money-management-app', DB_VERSION);

            // Fetch all transactions and accounts
            const [transactions, accounts] = await Promise.all([
                db.getAllFromIndex('transactions', 'by-date'),
                db.getAll('accounts')
            ]);

            // Sort transactions: date ascending, then id ascending
            transactions.sort((a, b) => {
                const dateCompare = a.date.localeCompare(b.date);
                if (dateCompare !== 0) return dateCompare;
                return a.id - b.id;
            });

            // Initialize balances
            const balancesByName: Record<string, string> = {};
            for (const acc of accounts) {
                balancesByName[acc.name] = '0';
            }

            // Recalculate
            for (const tx of transactions) {
                const amount = tx.amountAccountCurrency || '0';

                // If account doesn't exist in our map (e.g. deleted but transactions remain), just ignore it
                if (tx.accountName && balancesByName[tx.accountName] === undefined) {
                    balancesByName[tx.accountName] = '0';
                }

                if (tx.type === 'deposit') {
                    balancesByName[tx.accountName] = addStrings(balancesByName[tx.accountName], amount);
                } else if (tx.type === 'withdraw') {
                    balancesByName[tx.accountName] = subStrings(balancesByName[tx.accountName], amount);
                } else if (tx.type === 'transfer') {
                    balancesByName[tx.accountName] = subStrings(balancesByName[tx.accountName], amount);
                    if (tx.transferReceiveAccountName) {
                        if (balancesByName[tx.transferReceiveAccountName] === undefined) {
                            balancesByName[tx.transferReceiveAccountName] = '0';
                        }
                        const receiveAmount = tx.transferReceiveAmountAccountCurrency || '0';
                        balancesByName[tx.transferReceiveAccountName] = addStrings(balancesByName[tx.transferReceiveAccountName], receiveAmount);
                    }
                } else if (tx.type === 'balance_correct') {
                    balancesByName[tx.accountName] = amount;
                }
            }

            // Update database
            const txStore = db.transaction('accounts', 'readwrite');
            for (const acc of accounts) {
                if (acc.balance !== balancesByName[acc.name]) {
                    acc.balance = balancesByName[acc.name];
                    txStore.store.put(acc);
                }
            }
            await txStore.done;

            self.postMessage({ status: 'done' });
        } catch (error) {
            self.postMessage({ status: 'error', error: error instanceof Error ? error.message : String(error) });
        }
    }
};
