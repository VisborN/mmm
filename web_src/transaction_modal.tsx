import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { Transaction } from './domain/types';

export const TransactionModal = observer(() => {
    const [formData, setFormData] = useState<Partial<Transaction>>(store.currentTransaction || {
        id: 0,
        date: new Date().toISOString().split('T')[0],
        amountRubles: 0,
        amountAccountCurrency: '0',
        accountName: '',
        category: '',
        description: '',
        type: 'withdraw',
        transferReceiveAccountName: null,
        transferReceiveAmountAccountCurrency: null
    });

    React.useEffect(() => {
        if (store.isTransactionModalOpen) {
            setFormData(store.currentTransaction || {
                id: 0,
                date: new Date().toISOString().split('T')[0],
                amountRubles: 0,
                amountAccountCurrency: '0',
                accountName: '',
                category: '',
                description: '',
                type: 'withdraw',
                transferReceiveAccountName: null,
                transferReceiveAmountAccountCurrency: null
            });
        }
    }, [store.isTransactionModalOpen, store.currentTransaction]);

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
            [name]: name === 'amountRubles' ? (value === '' ? 0 : parseFloat(value)) : value
        }));
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>{store.currentTransaction ? 'Редактировать' : 'Новая операция'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Дата:</label>
                        <input type="date" name="date" value={formData.date || ''} onChange={handleChange} required className="form-input" />
                    </div>
                    
                    <div className="form-group">
                        <label className="form-label">Сумма (₽):</label>
                        <input type="number" step="0.01" name="amountRubles" value={formData.amountRubles || ''} onChange={handleChange} required className="form-input" />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Тип:</label>
                        <select name="type" value={formData.type || 'withdraw'} onChange={handleChange} className="form-select">
                            <option value="withdraw">Списание</option>
                            <option value="deposit">Пополнение</option>
                            <option value="transfer">Перевод</option>
                            <option value="balance_correct">Корректировка</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Счет:</label>
                        <select name="accountName" value={formData.accountName || ''} onChange={handleChange} required className="form-select">
                            <option value="" disabled>Выберите счет</option>
                            {store.accounts.map(acc => (
                                <option key={acc.id} value={acc.name}>{acc.name} ({acc.currency})</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Категория / Описание:</label>
                        <input type="text" name="description" value={formData.description || ''} onChange={handleChange} required className="form-input" />
                    </div>

                    {formData.type === 'transfer' && (
                        <div className="form-group">
                            <label className="form-label">Счет зачисления:</label>
                            <select name="transferReceiveAccountName" value={formData.transferReceiveAccountName || ''} onChange={handleChange} required className="form-select">
                                <option value="" disabled>Выберите счет</option>
                                {store.accounts.map(acc => (
                                    <option key={`recv-${acc.id}`} value={acc.name}>{acc.name} ({acc.currency})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="modal-actions">
                        <button type="button" onClick={() => store.closeTransactionModal()} className="btn btn-secondary">Отмена</button>
                        <button type="submit" className="btn btn-primary">Сохранить</button>
                    </div>
                </form>
            </div>
        </div>
    );
});
