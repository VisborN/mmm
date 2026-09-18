import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { Transaction } from './domain/types';
import { uuidv7 } from './domain/uuidv7';

export const TransactionModal = observer(() => {
    const [formData, setFormData] = useState<Partial<Transaction>>(store.currentTransaction || {
        uuid: uuidv7(),
        date: new Date().toISOString().split('T')[0],
        amountRubles: 0,
        amountAccountCurrency: '0',
        accountName: '',
        accountCurrency: 'RUB',
        category: '',
        description: '',
        type: 'withdraw',
        member: 'Общее',
        exchangeRate: 1,
        transferReceiveAccountName: null,
        transferReceiveAmountAccountCurrency: null
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const txToSave = { ...formData } as Transaction;
        if (!txToSave.uuid) {
            txToSave.uuid = uuidv7();
        }
        if (!txToSave.amountAccountCurrency || txToSave.amountAccountCurrency === '0') {
            txToSave.amountAccountCurrency = String(txToSave.amountRubles);
        }
        if (txToSave.type === 'transfer' && (!txToSave.transferReceiveAmountAccountCurrency || txToSave.transferReceiveAmountAccountCurrency === '0')) {
            txToSave.transferReceiveAmountAccountCurrency = String(txToSave.amountRubles);
        }
        if (txToSave.type === 'balance_correct') {
            if (!txToSave.category) txToSave.category = 'баланс';
            if (!txToSave.description) txToSave.description = 'Корректировка баланса';
        } else {
            if (!txToSave.category) txToSave.category = txToSave.description || '';
        }
        await store.saveTransaction(txToSave);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'amountRubles' 
                ? (value === '' ? 0 : parseFloat(value)) 
                : name === 'exchangeRate'
                ? (value === '' ? null : parseFloat(value))
                : value
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
                            <option value="balance_correct">Корректировка баланса</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Счет:</label>
                        <input
                            list="accounts-list"
                            name="accountName"
                            value={formData.accountName || ''}
                            onChange={handleChange}
                            required
                            placeholder="Выберите или введите счет"
                            className="form-input"
                        />
                        <datalist id="accounts-list">
                            {store.accounts.map(acc => (
                                <option key={acc.id} value={acc.name}>{acc.currency}</option>
                            ))}
                        </datalist>
                    </div>

                    {formData.type === 'balance_correct' && (
                        <>
                            <div className="form-group">
                                <label className="form-label">Валюта счета:</label>
                                <input
                                    type="text"
                                    name="accountCurrency"
                                    value={formData.accountCurrency || 'RUB'}
                                    onChange={handleChange}
                                    placeholder="RUB, USD, UZS..."
                                    className="form-input"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Курс к рублю (опционально):</label>
                                <input
                                    type="number"
                                    step="0.0001"
                                    name="exchangeRate"
                                    value={formData.exchangeRate ?? ''}
                                    onChange={handleChange}
                                    placeholder="1.0"
                                    className="form-input"
                                />
                            </div>
                        </>
                    )}

                    <div className="form-group">
                        <label className="form-label">Член семьи:</label>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                            {['Общее', 'Влад'].map(m => (
                                <button
                                    type="button"
                                    key={m}
                                    className="btn btn-secondary"
                                    style={{
                                        padding: '4px 12px',
                                        fontSize: '13px',
                                        background: formData.member === m ? 'var(--accent-color)' : undefined,
                                        color: formData.member === m ? '#ffffff' : undefined,
                                        borderColor: formData.member === m ? 'var(--accent-color)' : undefined
                                    }}
                                    onClick={() => setFormData(prev => ({ ...prev, member: m }))}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            name="member"
                            value={formData.member || ''}
                            onChange={handleChange}
                            placeholder="Общее, Влад..."
                            className="form-input"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Категория / Описание:</label>
                        <input
                            type="text"
                            name="description"
                            value={formData.description || ''}
                            onChange={handleChange}
                            required={formData.type !== 'balance_correct'}
                            placeholder={formData.type === 'balance_correct' ? 'Начальный баланс или корректировка' : 'Категория / описание'}
                            className="form-input"
                        />
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
