import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { Transaction } from './domain/types';
import { AccountsView } from './accounts_view';
import { DatabaseExplorer } from './db_explorer_view';

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

export const TransactionModal = observer(() => {
    const [formData, setFormData] = useState<Partial<Transaction>>(store.currentTransaction || {
        id: crypto.randomUUID(),
        date: new Date().toISOString().split('T')[0],
        amountRubles: 0,
        amountAccountCurrency: '0',
        accountId: '',
        category: '',
        description: '',
        type: 'withdraw',
        transferReceiveAccountId: null,
        transferReceiveAmountAccountCurrency: null
    });

    if (!store.isTransactionModalOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const txToSave = { ...formData } as Transaction;
        if (!txToSave.amountAccountCurrency || txToSave.amountAccountCurrency === '0') {
            txToSave.amountAccountCurrency = String(txToSave.amountRubles);
        }
        if (txToSave.type === 'transfer' && (!txToSave.transferReceiveAmountAccountCurrency || txToSave.transferReceiveAmountAccountCurrency === '0')) {
            txToSave.transferReceiveAmountAccountCurrency = String(txToSave.amountRubles);
        }
        await store.saveTransaction(txToSave);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'amountRubles' ? parseFloat(value) : value
        }));
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white', padding: '20px', borderRadius: '8px',
                width: '90%', maxWidth: '400px', maxHeight: '90vh', overflowY: 'auto'
            }}>
                <h3 style={{marginTop: 0}}>{store.currentTransaction ? 'Редактировать' : 'Новая операция'}</h3>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label>
                        Дата:
                        <input type="date" name="date" value={formData.date || ''} onChange={handleChange} required style={{width: '100%', padding: '5px', boxSizing: 'border-box'}} />
                    </label>
                    <label>
                        Сумма (₽):
                        <input type="number" step="0.01" name="amountRubles" value={formData.amountRubles || ''} onChange={handleChange} required style={{width: '100%', padding: '5px', boxSizing: 'border-box'}} />
                    </label>
                    <label>
                        Тип:
                        <select name="type" value={formData.type || 'withdraw'} onChange={handleChange} style={{width: '100%', padding: '5px', boxSizing: 'border-box'}}>
                            <option value="withdraw">Списание</option>
                            <option value="deposit">Пополнение</option>
                            <option value="transfer">Перевод</option>
                            <option value="balance_correct">Корректировка</option>
                        </select>
                    </label>
                    <label>
                        Счет:
                        <select name="accountId" value={formData.accountId || ''} onChange={handleChange} required style={{width: '100%', padding: '5px', boxSizing: 'border-box'}}>
                            <option value="" disabled>Выберите счет</option>
                            {store.accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Категория / Описание:
                        <input type="text" name="description" value={formData.description || ''} onChange={handleChange} required style={{width: '100%', padding: '5px', boxSizing: 'border-box'}} />
                    </label>

                    {formData.type === 'transfer' && (
                        <>
                            <label>
                                Счет зачисления:
                                <select name="transferReceiveAccountId" value={formData.transferReceiveAccountId || ''} onChange={handleChange} required style={{width: '100%', padding: '5px', boxSizing: 'border-box'}}>
                                    <option value="" disabled>Выберите счет</option>
                                    {store.accounts.map(acc => (
                                        <option key={`recv-${acc.id}`} value={acc.id}>{acc.name} ({acc.currency})</option>
                                    ))}
                                </select>
                            </label>
                        </>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                        <button type="button" onClick={() => store.closeTransactionModal()} style={{padding: '8px 16px', background: '#ccc', border: 'none', borderRadius: '4px'}}>Отмена</button>
                        <button type="submit" style={{padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px'}}>Сохранить</button>
                    </div>
                </form>
            </div>
        </div>
    );
});

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
            {sortedDates.map(dateStr => (
                <div key={dateStr}>
                    <div style={{
                        backgroundColor: '#e3f2fd',
                        padding: '8px 20px',
                        textAlign: 'right',
                        fontSize: '14px',
                        color: '#555'
                    }}>
                        {formatDate(dateStr)}
                    </div>
                    <div style={{ backgroundColor: 'white' }}>
                        {groupedTransactions[dateStr].map(tx => {
                            const isPositive = tx.type === 'deposit';
                            const color = isPositive ? '#2e7d32' : '#c62828';
                            const arrow = isPositive ? '▼' : '▲';

                            return (
                                <div
                                    key={tx.id}
                                    onClick={() => store.openTransactionModal(tx)}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        padding: '12px 20px',
                                        borderBottom: '1px solid #f0f0f0',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                        <span style={{ color: '#777', width: '40px', fontSize: '14px' }}>{tx.accountId.slice(-4)}</span>
                                        <span style={{ fontSize: '16px' }}>{tx.description || tx.category}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '16px' }}>{formatAmount(tx.amountRubles)}</span>
                                        <span style={{ color, fontSize: '12px' }}>{arrow}</span>
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

export const AppMain = observer(() => {
    useEffect(() => {
        store.loadData().then(() => {
            if (store.currentView === 'accounts') {
                store.recalculateBalances();
            }
        });
    }, []);

    if (store.isLoading) {
        return <div style={{padding: '20px'}}>Загрузка...</div>;
    }

    return (
        <div style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto', backgroundColor: '#f8f9fa', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <header style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 20px', backgroundColor: 'white', borderBottom: '1px solid #eee'
            }}>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'normal' }}>моней флов</h1>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <button
                        onClick={() => store.currentView === 'transactions' ? store.openTransactionModal() : store.openAccountModal()}
                        style={{background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: 0}}
                    >
                        ➕
                    </button>
                    <button
                        onClick={() => store.setView('settings')}
                        style={{background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: 0}}
                    >
                        ⚙️
                    </button>
                </div>
            </header>

            {store.error && (
                <div style={{ padding: '10px', backgroundColor: '#ffcccc', color: 'red' }}>
                    Ошибка: {store.error.message}
                </div>
            )}

            {store.currentView !== 'settings' && store.currentView !== 'db_explorer' && (
                <div style={{ display: 'flex', backgroundColor: 'white', borderBottom: '1px solid #ddd' }}>
                    <button
                        onClick={() => store.setView('transactions')}
                        style={{ flex: 1, padding: '12px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: store.currentView === 'transactions' ? 'bold' : 'normal', borderBottom: store.currentView === 'transactions' ? '2px solid #007bff' : '2px solid transparent' }}
                    >
                        Операции
                    </button>
                    <button
                        onClick={() => {
                            store.setView('accounts');
                            store.recalculateBalances();
                        }}
                        style={{ flex: 1, padding: '12px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: store.currentView === 'accounts' ? 'bold' : 'normal', borderBottom: store.currentView === 'accounts' ? '2px solid #007bff' : '2px solid transparent' }}
                    >
                        Счета
                    </button>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {store.currentView === 'transactions' && <TransactionsView />}
                {store.currentView === 'accounts' && <AccountsView />}
                {store.currentView === 'settings' && (
                    <div style={{ padding: '20px' }}>
                        <button
                            onClick={() => store.setView('transactions')}
                            style={{ padding: '8px 16px', marginBottom: '20px', cursor: 'pointer' }}
                        >
                            &larr; Назад
                        </button>
                        <h2>Настройки</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                            <button id="open-auth" style={{ padding: '10px 20px', backgroundColor: '#ffdd2d', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                Open Tinkoff Login
                            </button>
                            <button
                                onClick={() => store.setView('db_explorer')}
                                style={{ padding: '10px 20px', backgroundColor: '#eee', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Database Explorer
                            </button>
                        </div>
                    </div>
                )}
                {store.currentView === 'db_explorer' && <DatabaseExplorer />}
            </div>
        </div>
    );
});
