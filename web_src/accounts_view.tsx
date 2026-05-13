import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { Account } from './domain/types';

const formatAmount = (amountStr: string) => {
    // Basic formatting for the string amount
    const num = parseFloat(amountStr);
    if (isNaN(num)) return amountStr;
    return num.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

export const AccountModal = observer(() => {
    const [formData, setFormData] = useState<Partial<Account>>(store.currentAccount || {
        id: crypto.randomUUID(),
        name: '',
        currency: 'RUB',
        balance: '0'
    });

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
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white', padding: '20px', borderRadius: '8px',
                width: '90%', maxWidth: '400px'
            }}>
                <h3 style={{marginTop: 0}}>{store.currentAccount ? 'Редактировать счет' : 'Новый счет'}</h3>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label>
                        Название:
                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} required style={{width: '100%', padding: '5px', boxSizing: 'border-box'}} />
                    </label>
                    <label>
                        Валюта:
                        <input type="text" name="currency" value={formData.currency || ''} onChange={handleChange} required style={{width: '100%', padding: '5px', boxSizing: 'border-box'}} />
                    </label>
                    <label>
                        Баланс:
                        <input type="text" name="balance" value={formData.balance || ''} onChange={handleChange} required style={{width: '100%', padding: '5px', boxSizing: 'border-box'}} />
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                        <button type="button" onClick={() => store.closeAccountModal()} style={{padding: '8px 16px', background: '#ccc', border: 'none', borderRadius: '4px'}}>Отмена</button>
                        <button type="submit" style={{padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px'}}>Сохранить</button>
                    </div>
                </form>
            </div>
        </div>
    );
});

export const AccountsView = observer(() => {
    return (
        <div>
            <div style={{
                backgroundColor: '#e3f2fd',
                padding: '8px 20px',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                fontSize: '14px',
                color: '#555'
            }}>
                <button
                    onClick={() => store.openAccountModal()}
                    style={{padding: '4px 12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'}}
                >
                    Добавить
                </button>
            </div>

            {store.accounts.length === 0 ? (
                <p style={{ color: '#777', paddingLeft: '20px' }}>Нет добавленных счетов.</p>
            ) : (
                <div style={{ backgroundColor: 'white' }}>
                    {store.accounts.map(acc => (
                        <div
                            key={acc.id}
                            onClick={() => store.openAccountModal(acc)}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '12px 20px',
                                borderBottom: '1px solid #f0f0f0',
                                cursor: 'pointer',
                                alignItems: 'center'
                            }}
                        >
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                <span style={{ color: '#777', width: '40px', fontSize: '14px' }}>{acc.id.slice(-4)}</span>
                                <span style={{ fontSize: '16px' }}>{acc.name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '16px' }}>{formatAmount(acc.balance)} <span style={{ fontSize: '14px', color: '#555' }}>{acc.currency}</span></span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <AccountModal />
        </div>
    );
});
