import React from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { Transaction } from './domain/types';
import { TransactionModal } from './transaction_modal';
import { authStore } from './auth_store';

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

    return (
        <main>
            {authStore.isAuthenticated && (
                <div
                    style={{
                        padding: '10px 16px',
                        background: 'rgba(255, 221, 45, 0.08)',
                        borderBottom: '1px solid rgba(255, 221, 45, 0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>💳 Т-Банк</span>
                            {authStore.totalBalance !== null && (
                                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                                    ({authStore.totalBalance.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽)
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={authStore.isSyncing}
                            onClick={() => store.syncTBankRecent()}
                            style={{
                                padding: '4px 10px',
                                fontSize: '12px',
                                background: '#ffdd2d',
                                color: '#1e293b',
                                fontWeight: 600,
                                border: 'none',
                            }}
                            title="Обновить последние операции из Т-Банка (за 35 дней)"
                        >
                            {authStore.isSyncing ? 'Синхронизация...' : '🔄 Обновить'}
                        </button>
                    </div>

                    {authStore.isSyncing && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                <span>{authStore.syncProgress}</span>
                                <button
                                    type="button"
                                    onClick={() => authStore.cancelSync()}
                                    style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', padding: 0, fontSize: '11px' }}
                                >
                                    Отмена
                                </button>
                            </div>
                            <div style={{ height: '4px', width: '100%', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div
                                    style={{
                                        height: '100%',
                                        width: `${Math.max(5, authStore.syncPercent)}%`,
                                        background: '#ffdd2d',
                                        transition: 'width 0.3s ease',
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {!authStore.isSyncing && authStore.syncProgress && (
                        <div style={{ fontSize: '11px', color: 'var(--success-color)' }}>
                            ✓ {authStore.syncProgress}
                        </div>
                    )}

                    {authStore.syncError && (
                        <div style={{ fontSize: '11px', color: 'var(--danger-color)' }}>
                            ✗ {authStore.syncError}
                        </div>
                    )}
                </div>
            )}

            {store.transactions.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Нет добавленных операций.
                </div>
            ) : (
                sortedDates.map(dateStr => (
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
                                        key={tx.uuid}
                                        onClick={() => store.openTransactionModal(tx)}
                                        className="list-item"
                                    >
                                        <div className="item-left">
                                            <div className="item-icon-placeholder">{initial}</div>
                                            <div className="item-details">
                                                <span className="item-title">{tx.description || tx.category}</span>
                                                <span className="item-subtitle">
                                                    {tx.accountName}
                                                    {tx.member ? ` • ${tx.member}` : ''}
                                                    {tx.bankOperationIds && tx.bankOperationIds.length > 0 ? ' • 💳 Т-Банк' : ''}
                                                </span>
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
                ))
            )}
            {store.isTransactionModalOpen && <TransactionModal />}
        </main>
    );
});
