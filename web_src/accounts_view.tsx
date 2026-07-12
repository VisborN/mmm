import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { Account } from './domain/types';

const formatAmount = (amountStr: string) => {
    const num = parseFloat(amountStr);
    if (isNaN(num)) return amountStr;
    return num.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

export const AccountModal = observer(() => {
    const [formData, setFormData] = useState<Partial<Account>>(store.currentAccount || {
        id: 0,
        name: '',
        currency: 'RUB',
        balance: '0'
    });

    React.useEffect(() => {
        if (store.isAccountModalOpen) {
            setFormData(store.currentAccount || {
                id: 0,
                name: '',
                currency: 'RUB',
                balance: '0'
            });
        }
    }, [store.isAccountModalOpen, store.currentAccount]);

    if (!store.isAccountModalOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await store.saveAccount(formData as Account);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>{store.currentAccount ? 'Редактировать счет' : 'Новый счет'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Название:</label>
                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} required className="form-input" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Валюта:</label>
                        <input type="text" name="currency" value={formData.currency || ''} onChange={handleChange} required className="form-input" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Баланс:</label>
                        <input type="text" name="balance" value={formData.balance || ''} onChange={handleChange} required className="form-input" />
                    </div>

                    <div className="modal-actions">
                        <button type="button" onClick={() => store.closeAccountModal()} className="btn btn-secondary">Отмена</button>
                        <button type="submit" className="btn btn-primary">Сохранить</button>
                    </div>
                </form>
            </div>
        </div>
    );
});

export const AccountsView = observer(() => {
    return (
        <div>
            {store.accounts.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Нет добавленных счетов.
                </div>
            ) : (
                <div>
                    {store.accounts.map(acc => (
                        <div
                            key={acc.id}
                            onClick={() => store.openAccountModal(acc)}
                            className="list-item"
                        >
                            <div className="item-left">
                                <div className="item-icon-placeholder" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-color)', border: 'none' }}>
                                    {acc.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="item-details">
                                    <span className="item-title">{acc.name}</span>
                                    <span className="item-subtitle">Счет ID: {acc.id}</span>
                                </div>
                            </div>
                            <div className="item-right">
                                <span className="item-amount">
                                    {formatAmount(acc.balance)} <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{acc.currency}</span>
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <AccountModal />
        </div>
    );
});
