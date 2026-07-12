import React from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { Transaction } from './domain/types';
import { TransactionModal } from './transaction_modal';

// Utility for Russian locale formatting
const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
};

const formatAmount = (amount: number) => {
    return amount.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + ' ₽';
};

export const TransactionsView = observer(() => {
    // Group transactions by date
    const groupedTransactions = store.transactions.reduce((acc, tx) => {
        if (!acc[tx.date]) acc[tx.date] = [];
        acc[tx.date].push(tx);
        return acc;
    }, {} as Record<string, Transaction[]>);

    // Sort dates descending
    const sortedDates = Object.keys(groupedTransactions).sort((a, b) => b.localeCompare(a));

    if (store.transactions.length === 0) {
        return (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Нет добавленных операций.
            </div>
        );
    }

    return (
        <main>
            {sortedDates.map(dateStr => (
                <div key={dateStr}>
                    <div className="date-header">
                        {formatDate(dateStr)}
                    </div>
                    <div>
                        {groupedTransactions[dateStr].map(tx => {
                            const isPositive = tx.type === 'deposit';
                            const amountClass = isPositive ? 'amount-positive' : 'amount-negative';
                            const initial = (tx.description || tx.category || '?').charAt(0).toUpperCase();

                            return (
                                <div
                                    key={tx.id}
                                    onClick={() => store.openTransactionModal(tx)}
                                    className="list-item"
                                >
                                    <div className="item-left">
                                        <div className="item-icon-placeholder">{initial}</div>
                                        <div className="item-details">
                                            <span className="item-title">{tx.description || tx.category}</span>
                                            <span className="item-subtitle">{tx.accountName}</span>
                                        </div>
                                    </div>
                                    <div className="item-right">
                                        <span className={`item-amount ${amountClass}`}>
                                            {isPositive ? '+' : ''}{formatAmount(tx.amountRubles)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
            <TransactionModal />
        </main>
    );
});
