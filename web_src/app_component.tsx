import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { AccountsView } from './accounts_view';
import { DatabaseExplorer } from './db_explorer_view';
import { FolderSelectionModal } from './folder_selection_modal';
import { TransactionsView } from './transactions_view';
import { SettingsView } from './settings_view';

declare const __COMMIT_TIME__: string;

export const AppMain = observer(() => {
    useEffect(() => {
        store.loadData().then(() => {
            if (store.currentView === 'accounts') {
                store.recalculateBalances();
            }
        });
    }, []);

    if (store.isLoading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                {store.syncProgress && (
                    <div className="progress-badge">
                        {store.syncProgress}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="app-container">
            <header className="app-header">
                <div>
                    <h1 className="app-title">моней флов</h1>
                    <div className="app-version">v. {typeof __COMMIT_TIME__ !== 'undefined' ? __COMMIT_TIME__ : 'dev'}</div>
                </div>
                <div className="header-actions">
                    <button
                        onClick={() => store.currentView === 'transactions' ? store.openTransactionModal() : store.openAccountModal()}
                        className="icon-btn"
                        title="Add"
                    >
                        ➕
                    </button>
                    <button
                        onClick={() => store.setView('settings')}
                        className="icon-btn"
                        title="Settings"
                    >
                        ⚙️
                    </button>
                </div>
            </header>

            {store.error && (
                <div className="error-banner">
                    Ошибка: {store.error.message}
                </div>
            )}

            {store.currentView !== 'settings' && store.currentView !== 'db_explorer' && (
                <div className="nav-tabs">
                    <button
                        onClick={() => store.setView('transactions')}
                        className={`nav-tab ${store.currentView === 'transactions' ? 'active' : ''}`}
                    >
                        Операции
                    </button>
                    <button
                        onClick={() => {
                            store.setView('accounts');
                            store.recalculateBalances();
                        }}
                        className={`nav-tab ${store.currentView === 'accounts' ? 'active' : ''}`}
                    >
                        Счета
                    </button>
                </div>
            )}

            <div className="main-content">
                {store.currentView === 'transactions' && <TransactionsView />}
                {store.currentView === 'accounts' && <AccountsView />}
                {store.currentView === 'settings' && <SettingsView />}
                {store.currentView === 'db_explorer' && <DatabaseExplorer />}
            </div>
            
            {store.isFolderModalOpen && <FolderSelectionModal onClose={() => store.closeFolderModal()} />}
        </div>
    );
});
