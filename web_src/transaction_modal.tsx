import React, { useState, useEffect, useMemo, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { Transaction, TransactionType } from './domain/types';
import { uuidv7 } from './domain/uuidv7';

// Utility for formatting dates in Russian locale safely
const formatDateRu = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
};

const formatAmountRub = (amount: number) => {
    return amount.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + ' ₽';
};

const TYPE_CONFIG: Record<TransactionType, { label: string; icon: string; color: string }> = {
    withdraw: { label: 'Списание', icon: '💸', color: 'var(--text-primary)' },
    deposit: { label: 'Пополнение', icon: '💰', color: 'var(--success-color)' },
    transfer: { label: 'Перевод', icon: '🔄', color: 'var(--accent-color)' },
    balance_correct: { label: 'Баланс', icon: '⚖️', color: '#a78bfa' }
};

export const TransactionModal = observer(() => {
    const currentTx = store.currentTransaction;
    const isEditMode = !!currentTx;

    // Field currently being edited in-place (for edit mode)
    const [editingField, setEditingField] = useState<string | null>(null);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const isSavingRef = useRef(false);

    // Form data for creation mode
    const [createForm, setCreateForm] = useState<Partial<Transaction>>({
        uuid: uuidv7(),
        date: new Date().toISOString().split('T')[0],
        amountRubles: 0,
        amountAccountCurrency: '0',
        accountName: store.accounts.length > 0 ? store.accounts[0].name : '',
        accountCurrency: 'RUB',
        category: '',
        description: '',
        type: 'withdraw',
        member: 'Общее',
        exchangeRate: 1,
        transferReceiveAccountName: null,
        transferReceiveAmountAccountCurrency: null
    });

    // Extract unique categories and members for suggestions
    const uniqueCategories = useMemo(() => {
        const set = new Set<string>();
        store.transactions.forEach(t => {
            if (t.category && t.category.trim()) set.add(t.category.trim());
        });
        return Array.from(set).sort();
    }, [store.transactions]);

    const uniqueMembers = useMemo(() => {
        const set = new Set<string>(['Общее', 'Влад']);
        store.transactions.forEach(t => {
            if (t.member && t.member.trim()) set.add(t.member.trim());
        });
        return Array.from(set);
    }, [store.transactions]);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (editingField) {
                    setEditingField(null);
                } else if (isConfirmingDelete) {
                    setIsConfirmingDelete(false);
                } else {
                    store.closeTransactionModal();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingField, isConfirmingDelete]);

    // In-place save handler for Edit Mode
    const handleSaveField = async (field: keyof Transaction, val: unknown) => {
        if (!currentTx || isSavingRef.current) return;

        let normalizedVal = val;
        if (field === 'amountRubles') {
            normalizedVal = typeof val === 'number' ? val : (parseFloat(String(val)) || 0);
        } else if (field === 'exchangeRate') {
            normalizedVal = val === '' || val === null || val === undefined ? null : parseFloat(String(val));
        } else if (typeof val === 'string') {
            normalizedVal = val.trim();
        }

        // Avoid redundant saves if value didn't change
        const currentVal = currentTx[field];
        if (currentVal === normalizedVal) {
            setEditingField(null);
            return;
        }

        isSavingRef.current = true;
        try {
            const updated = { ...currentTx, [field]: normalizedVal };
            if (field === 'amountRubles') {
                const num = normalizedVal as number;
                updated.amountRubles = num;
                if (!currentTx.accountCurrency || currentTx.accountCurrency === 'RUB') {
                    updated.amountAccountCurrency = String(num);
                }
            }
            if (field === 'type' && normalizedVal === 'balance_correct') {
                if (!updated.category) updated.category = 'баланс';
                if (!updated.description) updated.description = 'Корректировка баланса';
            }
            await store.saveTransaction(updated, true);
        } finally {
            isSavingRef.current = false;
            setEditingField(null);
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            setEditingField(null);
        }
    };

    // Create mode submit
    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const txToSave = { ...createForm } as Transaction;
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

    const handleCreateChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setCreateForm(prev => ({
            ...prev,
            [name]: name === 'amountRubles' 
                ? (value === '' ? 0 : parseFloat(value)) 
                : name === 'exchangeRate'
                ? (value === '' ? null : parseFloat(value))
                : value
        }));
    };

    const setQuickDate = (daysAgo: number) => {
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        setCreateForm(prev => ({ ...prev, date: d.toISOString().split('T')[0] }));
    };

    return (
        <div 
            className="modal-overlay"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                    e.preventDefault();
                }
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    store.closeTransactionModal();
                }
            }}
        >
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                {/* Datalists for autocompletion */}
                <datalist id="categories-list">
                    {uniqueCategories.map(cat => (
                        <option key={cat} value={cat} />
                    ))}
                </datalist>
                <datalist id="accounts-list">
                    {store.accounts.map(acc => (
                        <option key={acc.id} value={acc.name}>{acc.currency}</option>
                    ))}
                </datalist>

                {/* EDIT MODE (ReadView with Click-to-Edit) */}
                {isEditMode && currentTx && (
                    <div>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="badge" style={{ borderColor: TYPE_CONFIG[currentTx.type].color, color: TYPE_CONFIG[currentTx.type].color }}>
                                    {TYPE_CONFIG[currentTx.type].icon} {TYPE_CONFIG[currentTx.type].label}
                                </span>
                            </div>
                            <button 
                                type="button" 
                                className="modal-close-btn" 
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => store.closeTransactionModal()}
                                title="Закрыть (Esc)"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Segmented Type Selector */}
                        <div className="segmented-control">
                            {(Object.keys(TYPE_CONFIG) as TransactionType[]).map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    className={`segmented-btn ${currentTx.type === t ? 'active' : ''}`}
                                    onClick={() => handleSaveField('type', t)}
                                >
                                    {TYPE_CONFIG[t].icon} {TYPE_CONFIG[t].label}
                                </button>
                            ))}
                        </div>

                        {/* Hero Amount Box */}
                        <div 
                            className={`hero-amount-box ${editingField !== 'amountRubles' ? 'clickable' : ''}`}
                            onClick={() => {
                                if (editingField !== 'amountRubles') setEditingField('amountRubles');
                            }}
                        >
                            {editingField === 'amountRubles' ? (
                                <input
                                    type="number"
                                    step="0.01"
                                    autoFocus
                                    className="hero-amount-input"
                                    defaultValue={currentTx.amountRubles || ''}
                                    onFocus={(e) => e.target.select()}
                                    onBlur={(e) => handleSaveField('amountRubles', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                    onKeyDown={handleInputKeyDown}
                                />
                            ) : (
                                <div>
                                    <div 
                                        className="hero-amount-value"
                                        style={{ color: currentTx.type === 'deposit' ? 'var(--success-color)' : 'var(--text-primary)' }}
                                    >
                                        {currentTx.type === 'deposit' ? '+' : ''}{formatAmountRub(currentTx.amountRubles)}
                                        <span className="detail-edit-pencil">✏️</span>
                                    </div>
                                    {currentTx.accountCurrency && currentTx.accountCurrency !== 'RUB' && (
                                        <div className="hero-amount-sub">
                                            {currentTx.amountAccountCurrency} {currentTx.accountCurrency}
                                            {currentTx.exchangeRate ? ` • курс: ${currentTx.exchangeRate} ₽` : ''}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Details Card with In-Place Editable Rows */}
                        <div className="detail-card">
                            {/* Account Row */}
                            <div 
                                className={`detail-row ${editingField === 'accountName' ? 'is-editing' : 'clickable'}`}
                                onClick={() => { if (editingField !== 'accountName') setEditingField('accountName'); }}
                            >
                                <span className="detail-label">💳 Счет</span>
                                {editingField === 'accountName' ? (
                                    <select
                                        className="detail-input"
                                        autoFocus
                                        defaultValue={currentTx.accountName || ''}
                                        onChange={(e) => handleSaveField('accountName', e.target.value)}
                                        onBlur={() => setEditingField(null)}
                                        onKeyDown={handleInputKeyDown}
                                    >
                                        {store.accounts.map(acc => (
                                            <option key={acc.id} value={acc.name}>{acc.name} ({acc.currency})</option>
                                        ))}
                                    </select>
                                ) : (
                                    <span className="detail-value">
                                        {currentTx.accountName || '—'}
                                        <span className="detail-edit-pencil">✏️</span>
                                    </span>
                                )}
                            </div>

                            {/* Transfer Receive Account (if transfer) */}
                            {currentTx.type === 'transfer' && (
                                <div 
                                    className={`detail-row ${editingField === 'transferReceiveAccountName' ? 'is-editing' : 'clickable'}`}
                                    onClick={() => { if (editingField !== 'transferReceiveAccountName') setEditingField('transferReceiveAccountName'); }}
                                >
                                    <span className="detail-label">📥 Счет зачисления</span>
                                    {editingField === 'transferReceiveAccountName' ? (
                                        <select
                                            className="detail-input"
                                            autoFocus
                                            defaultValue={currentTx.transferReceiveAccountName || ''}
                                            onChange={(e) => handleSaveField('transferReceiveAccountName', e.target.value)}
                                            onBlur={() => setEditingField(null)}
                                            onKeyDown={handleInputKeyDown}
                                        >
                                            <option value="" disabled>Выберите счет</option>
                                            {store.accounts.map(acc => (
                                                <option key={`recv-${acc.id}`} value={acc.name}>{acc.name} ({acc.currency})</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className="detail-value">
                                            {currentTx.transferReceiveAccountName || '—'}
                                            <span className="detail-edit-pencil">✏️</span>
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Category Row */}
                            <div 
                                className={`detail-row ${editingField === 'category' ? 'is-editing' : 'clickable'}`}
                                onClick={() => { if (editingField !== 'category') setEditingField('category'); }}
                            >
                                <span className="detail-label">📁 Категория</span>
                                {editingField === 'category' ? (
                                    <input
                                        list="categories-list"
                                        className="detail-input"
                                        autoFocus
                                        defaultValue={currentTx.category || ''}
                                        onFocus={(e) => e.target.select()}
                                        onBlur={(e) => handleSaveField('category', e.target.value)}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                ) : (
                                    <span className="detail-value">
                                        {currentTx.category || '—'}
                                        <span className="detail-edit-pencil">✏️</span>
                                    </span>
                                )}
                            </div>

                            {/* Description Row */}
                            <div 
                                className={`detail-row ${editingField === 'description' ? 'is-editing' : 'clickable'}`}
                                onClick={() => { if (editingField !== 'description') setEditingField('description'); }}
                            >
                                <span className="detail-label">📝 Описание</span>
                                {editingField === 'description' ? (
                                    <input
                                        type="text"
                                        className="detail-input"
                                        autoFocus
                                        defaultValue={currentTx.description || ''}
                                        onFocus={(e) => e.target.select()}
                                        onBlur={(e) => handleSaveField('description', e.target.value)}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                ) : (
                                    <span className="detail-value">
                                        {currentTx.description || '—'}
                                        <span className="detail-edit-pencil">✏️</span>
                                    </span>
                                )}
                            </div>

                            {/* Date Row */}
                            <div 
                                className={`detail-row ${editingField === 'date' ? 'is-editing' : 'clickable'}`}
                                onClick={() => { if (editingField !== 'date') setEditingField('date'); }}
                            >
                                <span className="detail-label">📅 Дата</span>
                                {editingField === 'date' ? (
                                    <input
                                        type="date"
                                        className="detail-input"
                                        autoFocus
                                        defaultValue={currentTx.date || ''}
                                        onBlur={(e) => {
                                            if (e.target.value) handleSaveField('date', e.target.value);
                                            else setEditingField(null);
                                        }}
                                        onKeyDown={handleInputKeyDown}
                                    />
                                ) : (
                                    <span className="detail-value">
                                        {formatDateRu(currentTx.date)}
                                        <span className="detail-edit-pencil">✏️</span>
                                    </span>
                                )}
                            </div>

                            {/* Member Row */}
                            <div 
                                className={`detail-row ${editingField === 'member' ? 'is-editing' : 'clickable'}`}
                                onClick={() => { if (editingField !== 'member') setEditingField('member'); }}
                            >
                                <span className="detail-label">👤 Член семьи</span>
                                {editingField === 'member' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                                        <div className="chips-group">
                                            {uniqueMembers.map(m => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    className={`chip-item ${currentTx.member === m ? 'active' : ''}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSaveField('member', m);
                                                    }}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                        <input
                                            type="text"
                                            className="detail-input"
                                            autoFocus
                                            defaultValue={currentTx.member || ''}
                                            placeholder="Другое имя..."
                                            onFocus={(e) => e.target.select()}
                                            onBlur={(e) => handleSaveField('member', e.target.value)}
                                            onKeyDown={handleInputKeyDown}
                                        />
                                    </div>
                                ) : (
                                    <span className="detail-value">
                                        {currentTx.member || 'Не указан'}
                                        <span className="detail-edit-pencil">✏️</span>
                                    </span>
                                )}
                            </div>

                            {/* Balance Correct specific fields */}
                            {currentTx.type === 'balance_correct' && (
                                <>
                                    <div 
                                        className={`detail-row ${editingField === 'accountCurrency' ? 'is-editing' : 'clickable'}`}
                                        onClick={() => { if (editingField !== 'accountCurrency') setEditingField('accountCurrency'); }}
                                    >
                                        <span className="detail-label">💱 Валюта</span>
                                        {editingField === 'accountCurrency' ? (
                                            <input
                                                type="text"
                                                className="detail-input"
                                                autoFocus
                                                defaultValue={currentTx.accountCurrency || 'RUB'}
                                                onFocus={(e) => e.target.select()}
                                                onBlur={(e) => handleSaveField('accountCurrency', e.target.value)}
                                                onKeyDown={handleInputKeyDown}
                                            />
                                        ) : (
                                            <span className="detail-value">
                                                {currentTx.accountCurrency || 'RUB'}
                                                <span className="detail-edit-pencil">✏️</span>
                                            </span>
                                        )}
                                    </div>
                                    <div 
                                        className={`detail-row ${editingField === 'exchangeRate' ? 'is-editing' : 'clickable'}`}
                                        onClick={() => { if (editingField !== 'exchangeRate') setEditingField('exchangeRate'); }}
                                    >
                                        <span className="detail-label">📈 Курс к рублю</span>
                                        {editingField === 'exchangeRate' ? (
                                            <input
                                                type="number"
                                                step="0.0001"
                                                className="detail-input"
                                                autoFocus
                                                defaultValue={currentTx.exchangeRate ?? ''}
                                                onFocus={(e) => e.target.select()}
                                                onBlur={(e) => handleSaveField('exchangeRate', e.target.value ? parseFloat(e.target.value) : null)}
                                                onKeyDown={handleInputKeyDown}
                                            />
                                        ) : (
                                            <span className="detail-value">
                                                {currentTx.exchangeRate ? `${currentTx.exchangeRate} ₽` : '—'}
                                                <span className="detail-edit-pencil">✏️</span>
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer / Delete / Close Actions */}
                        {isConfirmingDelete ? (
                            <div className="delete-confirm-box">
                                <span style={{ fontSize: '13px', color: 'var(--danger-color)', fontWeight: 500 }}>
                                    Удалить эту операцию?
                                </span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                        type="button" 
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => setIsConfirmingDelete(false)} 
                                        className="btn btn-secondary" 
                                        style={{ padding: '6px 12px', fontSize: '12px' }}
                                    >
                                        Отмена
                                    </button>
                                    <button 
                                        type="button" 
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => store.deleteTransaction(currentTx.uuid)} 
                                        className="btn btn-danger" 
                                        style={{ padding: '6px 12px', fontSize: '12px' }}
                                    >
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="modal-actions" style={{ justifyContent: 'space-between', marginTop: '20px' }}>
                                <button 
                                    type="button" 
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setIsConfirmingDelete(true)} 
                                    className="btn btn-danger"
                                    style={{ padding: '8px 14px', fontSize: '13px' }}
                                >
                                    🗑️ Удалить
                                </button>
                                <button 
                                    type="button" 
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => store.closeTransactionModal()} 
                                    className="btn btn-secondary"
                                    style={{ padding: '8px 18px', fontSize: '13px' }}
                                >
                                    Закрыть
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* CREATE MODE (Streamlined Fast Entry Form) */}
                {!isEditMode && (
                    <div>
                        <div className="modal-header">
                            <h3>Новая операция</h3>
                            <button 
                                type="button" 
                                className="modal-close-btn" 
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => store.closeTransactionModal()}
                                title="Закрыть (Esc)"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleCreateSubmit}>
                            {/* Segmented Type Selector */}
                            <div className="segmented-control">
                                {(Object.keys(TYPE_CONFIG) as TransactionType[]).map(t => (
                                    <button
                                        key={t}
                                        type="button"
                                        className={`segmented-btn ${createForm.type === t ? 'active' : ''}`}
                                        onClick={() => setCreateForm(prev => ({ ...prev, type: t }))}
                                    >
                                        {TYPE_CONFIG[t].icon} {TYPE_CONFIG[t].label}
                                    </button>
                                ))}
                            </div>

                            {/* Hero Amount Input */}
                            <div className="hero-amount-box">
                                <input
                                    type="number"
                                    step="0.01"
                                    name="amountRubles"
                                    autoFocus
                                    placeholder="0.00"
                                    value={createForm.amountRubles || ''}
                                    onChange={handleCreateChange}
                                    required
                                    className="hero-amount-input"
                                    style={{ color: createForm.type === 'deposit' ? 'var(--success-color)' : 'var(--text-primary)' }}
                                />
                                <div className="hero-amount-sub">Сумма в рублях (₽)</div>
                            </div>

                            {/* Date Field with Quick Chips */}
                            <div className="form-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label className="form-label" style={{ margin: 0 }}>Дата:</label>
                                    <div className="chips-group">
                                        <button type="button" className="chip-item" onClick={() => setQuickDate(0)}>Сегодня</button>
                                        <button type="button" className="chip-item" onClick={() => setQuickDate(1)}>Вчера</button>
                                    </div>
                                </div>
                                <input 
                                    type="date" 
                                    name="date" 
                                    value={createForm.date || ''} 
                                    onChange={handleCreateChange} 
                                    required 
                                    className="form-input" 
                                />
                            </div>

                            {/* Account Field */}
                            <div className="form-group">
                                <label className="form-label">Счет:</label>
                                <input
                                    list="accounts-list"
                                    name="accountName"
                                    value={createForm.accountName || ''}
                                    onChange={handleCreateChange}
                                    required
                                    placeholder="Выберите или введите счет"
                                    className="form-input"
                                />
                            </div>

                            {/* Transfer Receive Account */}
                            {createForm.type === 'transfer' && (
                                <div className="form-group">
                                    <label className="form-label">Счет зачисления:</label>
                                    <select 
                                        name="transferReceiveAccountName" 
                                        value={createForm.transferReceiveAccountName || ''} 
                                        onChange={handleCreateChange} 
                                        required 
                                        className="form-select"
                                    >
                                        <option value="" disabled>Выберите счет</option>
                                        {store.accounts.map(acc => (
                                            <option key={`recv-${acc.id}`} value={acc.name}>{acc.name} ({acc.currency})</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Balance Correct specific fields */}
                            {createForm.type === 'balance_correct' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Валюта счета:</label>
                                        <input
                                            type="text"
                                            name="accountCurrency"
                                            value={createForm.accountCurrency || 'RUB'}
                                            onChange={handleCreateChange}
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
                                            value={createForm.exchangeRate ?? ''}
                                            onChange={handleCreateChange}
                                            placeholder="1.0"
                                            className="form-input"
                                        />
                                    </div>
                                </>
                            )}

                            {/* Category Field with Datalist */}
                            <div className="form-group">
                                <label className="form-label">Категория:</label>
                                <input
                                    list="categories-list"
                                    type="text"
                                    name="category"
                                    value={createForm.category || ''}
                                    onChange={handleCreateChange}
                                    placeholder="Продукты, Кафе, Зарплата..."
                                    className="form-input"
                                />
                            </div>

                            {/* Description Field */}
                            <div className="form-group">
                                <label className="form-label">Описание / Заметка:</label>
                                <input
                                    type="text"
                                    name="description"
                                    value={createForm.description || ''}
                                    onChange={handleCreateChange}
                                    required={createForm.type !== 'balance_correct'}
                                    placeholder={createForm.type === 'balance_correct' ? 'Корректировка баланса' : 'Описание'}
                                    className="form-input"
                                />
                            </div>

                            {/* Member Field with Chips */}
                            <div className="form-group">
                                <label className="form-label">Член семьи:</label>
                                <div className="chips-group" style={{ marginBottom: '8px' }}>
                                    {uniqueMembers.map(m => (
                                        <button
                                            type="button"
                                            key={m}
                                            className={`chip-item ${createForm.member === m ? 'active' : ''}`}
                                            onClick={() => setCreateForm(prev => ({ ...prev, member: m }))}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    name="member"
                                    value={createForm.member || ''}
                                    onChange={handleCreateChange}
                                    placeholder="Общее, Влад..."
                                    className="form-input"
                                />
                            </div>

                            {/* Actions */}
                            <div className="modal-actions">
                                <button 
                                    type="button" 
                                    onClick={() => store.closeTransactionModal()} 
                                    className="btn btn-secondary"
                                >
                                    Отмена
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Создать операцию
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
});
