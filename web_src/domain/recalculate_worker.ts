import { openDB } from 'idb';
import { MoneyAppDB } from '../infrastructure/db';
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
            const db = await openDB<MoneyAppDB>('money-management-app', 1);

            // Fetch all transactions and accounts
            const [transactions, accounts] = await Promise.all([
                db.getAllFromIndex('transactions', 'by-date'),
                db.getAll('accounts')
            ]);

            // Sort transactions: date ascending, then id ascending
            transactions.sort((a, b) => {
                if (a.date === b.date) {
                    return a.id > b.id ? 1 : a.id < b.id ? -1 : 0;
                }
                return a.date > b.date ? 1 : a.date < b.date ? -1 : 0;
            });

            // Initialize balances
            const balances: Record<string, string> = {};
            for (const acc of accounts) {
                balances[acc.id] = '0';
            }

            // Recalculate
            for (const tx of transactions) {
                const amount = tx.amountAccountCurrency || '0';

                // If account doesn't exist in our map (e.g. deleted but transactions remain), just ignore it
                if (tx.accountId && balances[tx.accountId] === undefined) {
                    balances[tx.accountId] = '0';
                }

                if (tx.type === 'deposit') {
                    balances[tx.accountId] = addStrings(balances[tx.accountId], amount);
                } else if (tx.type === 'withdraw') {
                    balances[tx.accountId] = subStrings(balances[tx.accountId], amount);
                } else if (tx.type === 'transfer') {
                    balances[tx.accountId] = subStrings(balances[tx.accountId], amount);
                    if (tx.transferReceiveAccountId) {
                        if (balances[tx.transferReceiveAccountId] === undefined) {
                            balances[tx.transferReceiveAccountId] = '0';
                        }
                        const receiveAmount = tx.transferReceiveAmountAccountCurrency || '0';
                        balances[tx.transferReceiveAccountId] = addStrings(balances[tx.transferReceiveAccountId], receiveAmount);
                    }
                } else if (tx.type === 'balance_correct') {
                    balances[tx.accountId] = amount;
                }
            }

            // Update database
            const tx = db.transaction('accounts', 'readwrite');
            for (const acc of accounts) {
                if (acc.balance !== balances[acc.id]) {
                    acc.balance = balances[acc.id];
                    tx.store.put(acc);
                }
            }
            await tx.done;

            self.postMessage({ status: 'done' });
        } catch (error) {
            self.postMessage({ status: 'error', error: error instanceof Error ? error.message : String(error) });
        }
    }
};
