export interface Account {
    id: number;
    name: string;
    currency: string;
    balance: string; // Stored as a string to preserve precision
}

export type TransactionType = 'withdraw' | 'transfer' | 'deposit' | 'balance_correct';

export interface Transaction {
    uuid: string;
    date: string; // YYYY-MM-DD
    amountRubles: number; // precision 2 digits
    amountAccountCurrency: string; // Stored as string to support any precision
    accountName: string;
    accountCurrency?: string;
    category: string;
    description: string;
    type: TransactionType;
    member?: string | null;
    exchangeRate?: number | null;

    // Non-null only for transfer
    transferReceiveAccountName: string | null;
    transferReceiveAmountAccountCurrency: string | null;
}
