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

    // Many-to-many link to bank operations
    bankOperationIds?: string[] | null;
}

export interface BankOperation {
    id: string; // e.g. "tbank:<actualId>" where actualId is authorizationId ?? id
    bank: string; // "tbank"
    bankAccountId: string; // Account identifier in bank (e.g. "0290472137")
    operationTime: number; // Milliseconds timestamp
    status: string; // "OK", "FAILED", "HOLD", etc.
    type: string; // "Credit", "Debit"
    group?: string; // "PAY", "INCOME", "TRANSFER"
    amount: number; // Operation amount (float)
    currency: string; // Currency code ("RUB", "USD", etc.)
    accountAmount?: number; // Amount debited/credited in account currency
    accountCurrency?: string; // Account currency ("RUB")
    description: string;
    category?: string; // Spending category
    mcc?: number | null;
    isInner?: boolean; // True for internal transfers between accounts
    innerCounterpartId?: string | null; // Counterpart account agreement if inner transfer
    source: string; // Full unparsed raw JSON string from server API
}
