import { makeAutoObservable, runInAction } from "mobx";
import { Account, Transaction } from "./types";
import { indexedDBRepository } from "../infrastructure/repository";
import { googleSyncService } from "./google_sync_service";
import { get, set, clear as clearKeyval } from "idb-keyval";
import { googleDriveService } from "../infrastructure/google_drive";
import { uuidv7 } from "./uuidv7";
import { authStore } from "../auth_store";

declare const __WORKER_URL__: string;

export class AppStore {
    transactions: Transaction[] = [];
    accounts: Account[] = [];

    currentView: 'transactions' | 'accounts' | 'settings' | 'db_explorer' = 'transactions';

    isTransactionModalOpen: boolean = false;
    currentTransaction: Transaction | null = null;

    isAccountModalOpen: boolean = false;
    currentAccount: Account | null = null;

    isFolderModalOpen: boolean = false;

    isLoading: boolean = true;
    isInitialized: boolean = false;
    syncProgress: string = '';
    error: Error | null = null;

    isRecalculating: boolean = false;
    syncFolderId: string | null = null;
    syncFolderName: string | null = null;
    googleAccountEmail: string | null = null;

    constructor() {
        makeAutoObservable(this);
        if (typeof window !== 'undefined') {
            this.initRouting();
        }
    }

    initRouting(): void {
        window.addEventListener('hashchange', () => this.handleHashChange());
        if (!window.location.hash) {
            window.location.hash = 'transactions';
        } else {
            this.handleHashChange();
        }
    }

    handleHashChange(): void {
        const hash = window.location.hash.replace('#', '');
        runInAction(() => {
            if (hash === 'modal-tx') {
                this.isTransactionModalOpen = true;
            } else if (hash === 'modal-account') {
                this.isAccountModalOpen = true;
            } else if (hash === 'modal-folder') {
                this.isFolderModalOpen = true;
            } else {
                this.isTransactionModalOpen = false;
                this.isAccountModalOpen = false;
                this.isFolderModalOpen = false;
                this.currentTransaction = null;
                this.currentAccount = null;
                
                if (['transactions', 'accounts', 'settings', 'db_explorer'].includes(hash)) {
                    this.currentView = hash as 'transactions' | 'accounts' | 'settings' | 'db_explorer';
                } else {
                    this.currentView = 'transactions';
                }
            }
        });
    }

    async loadGoogleAccountEmail(): Promise<void> {
        const emailRes = await googleSyncService.getUserEmail();
        if (!emailRes.error && emailRes.data) {
            runInAction(() => {
                this.googleAccountEmail = emailRes.data;
            });
        } else {
             runInAction(() => {
                this.googleAccountEmail = null;
            });
        }
    }

    async setSyncFolder(id: string | null, name: string | null): Promise<void> {
        this.syncFolderId = id;
        this.syncFolderName = name;
        await set('syncFolderId', id);
        await set('syncFolderName', name);
    }

    async exportToGoogleDrive(): Promise<void> {
        runInAction(() => {
            this.isLoading = true;
            this.syncProgress = 'Аутентификация...';
        });
        
        const authRes = await googleDriveService.ensureAuthenticated();
        if (authRes.error) {
            runInAction(() => {
                this.error = authRes.error;
                this.isLoading = false;
                this.syncProgress = '';
            });
            return;
        }

        runInAction(() => {
            this.syncProgress = 'Подготовка к экспорту...';
        });
        try {
            const result = await googleSyncService.exportToGoogleDrive(this.transactions, this.syncFolderId || undefined, (progress) => {
                runInAction(() => { this.syncProgress = progress; });
            });
            this.loadGoogleAccountEmail();
            runInAction(() => {
                if (result.error) {
                    this.error = result.error;
                    alert(`Ошибка экспорта: ${result.error.message}`);
                } else {
                    this.error = null;
                    alert('Экспорт успешно завершен!');
                }
            });
        } catch (e: unknown) {
            runInAction(() => {
                this.error = e instanceof Error ? e : new Error(String(e));
                alert(`Непредвиденная ошибка: ${this.error.message}`);
            });
        } finally {
            runInAction(() => {
                this.isLoading = false;
                this.syncProgress = '';
            });
        }
    }

    async importFromGoogleDrive(): Promise<void> {
        runInAction(() => {
            this.isLoading = true;
            this.syncProgress = 'Аутентификация...';
        });
        
        const authRes = await googleDriveService.ensureAuthenticated();
        if (authRes.error) {
            runInAction(() => {
                this.error = authRes.error;
                this.isLoading = false;
                this.syncProgress = '';
            });
            return;
        }

        runInAction(() => {
            this.syncProgress = 'Поиск файлов...';
        });
        try {
            const result = await googleSyncService.importFromGoogleDrive(this.syncFolderId || undefined, (progress) => {
                runInAction(() => { this.syncProgress = progress; });
            });
            
            if (result.error) {
                runInAction(() => { this.error = result.error; });
                return;
            }

            runInAction(() => {
                this.syncProgress = 'Сохранение в базу данных...';
            });
            const replaceRes = await indexedDBRepository.replaceAllTransactions(result.data);
            if (replaceRes.error) {
                runInAction(() => { this.error = replaceRes.error; });
                return;
            }

            await this.loadData();
            this.loadGoogleAccountEmail();
            runInAction(() => { this.error = null; });
            this.recalculateBalances();
        } catch (e: unknown) {
            runInAction(() => {
                this.error = e instanceof Error ? e : new Error(String(e));
            });
        } finally {
            runInAction(() => {
                this.isLoading = false;
                this.syncProgress = '';
            });
        }
    }

    recalculateBalances(): void {
        if (this.isRecalculating) return;
        this.isRecalculating = true;

        const workerUrl = typeof __WORKER_URL__ !== 'undefined' ? __WORKER_URL__ : '/domain/recalculate_worker.js';
        const worker = new Worker(workerUrl);
        worker.onmessage = (e: MessageEvent): void => {
            if (e.data.status === 'done') {
                this.loadData().then(() => {
                    runInAction(() => {
                        this.isRecalculating = false;
                    });
                });
            } else if (e.data.status === 'error') {
                console.error('Error recalculating balances:', e.data.error);
                runInAction(() => {
                    this.error = new Error(e.data.error);
                    this.isRecalculating = false;
                });
            }
            worker.terminate();
        };

        worker.onerror = (e: ErrorEvent): void => {
            console.error('Worker error:', e);
            runInAction(() => {
                this.error = new Error('Worker error during recalculation');
                this.isRecalculating = false;
            });
            worker.terminate();
        };

        worker.postMessage('recalculate');
    }

    async loadData(isInitial = false): Promise<void> {
        if (isInitial || !this.isInitialized) {
            runInAction(() => {
                this.isLoading = true;
            });
        }
        runInAction(() => {
            this.error = null;
        });

        const folderId = await get('syncFolderId');
        const folderName = await get('syncFolderName');
        runInAction(() => {
            if (folderId !== undefined) this.syncFolderId = folderId;
            if (folderName !== undefined) this.syncFolderName = folderName;
        });

        const { data: accountsData, error: accountsErr } = await indexedDBRepository.getAccounts();
        if (accountsErr) {
            runInAction(() => {
                this.error = accountsErr;
                this.isLoading = false;
                this.isInitialized = true;
            });
            return;
        }

        const { data: txData, error: txErr } = await indexedDBRepository.getTransactions();
        if (txErr) {
            runInAction(() => {
                this.error = txErr;
                this.isLoading = false;
                this.isInitialized = true;
            });
            return;
        }

        runInAction(() => {
            this.accounts = accountsData;
            this.transactions = txData;
            this.isLoading = false;
            this.isInitialized = true;
        });

        this.loadGoogleAccountEmail();
    }

    openTransactionModal(transaction?: Transaction): void {
        this.currentTransaction = transaction || null;
        this.isTransactionModalOpen = true;
        if (window.location.hash !== '#modal-tx') {
            window.location.hash = 'modal-tx';
        }
    }

    closeTransactionModal(): void {
        this.isTransactionModalOpen = false;
        this.currentTransaction = null;
        if (window.location.hash === '#modal-tx') {
            window.history.back();
        }
    }

    async saveTransaction(transaction: Transaction, keepOpen = false): Promise<void> {
        if (!transaction.uuid) {
            transaction.uuid = uuidv7();
        }
        const { error } = await indexedDBRepository.saveTransaction(transaction);
        if (error) {
            runInAction(() => {
                this.error = error;
            });
            return;
        }

        await this.loadData();
        if (keepOpen) {
            runInAction(() => {
                if (this.isTransactionModalOpen) {
                    this.currentTransaction = transaction;
                }
            });
        } else {
            this.closeTransactionModal();
        }
        this.recalculateBalances();
    }

    async deleteTransaction(uuid: string): Promise<void> {
        const { error } = await indexedDBRepository.deleteTransaction(uuid);
        if (error) {
            runInAction(() => {
                this.error = error;
            });
            return;
        }

        await this.loadData();
        this.closeTransactionModal();
        this.recalculateBalances();
    }

    openAccountModal(account?: Account): void {
        this.currentAccount = account || null;
        this.isAccountModalOpen = true;
        if (window.location.hash !== '#modal-account') {
            window.location.hash = 'modal-account';
        }
    }

    closeAccountModal(): void {
        this.isAccountModalOpen = false;
        this.currentAccount = null;
        if (window.location.hash === '#modal-account') {
            window.history.back();
        }
    }

    async saveAccount(account: Account): Promise<void> {
        const isNew = !account.id || account.id === 0 || !this.accounts.some(a => a.id === account.id);
        if (isNew) {
            // New accounts are established via an initial balance_correct transaction
            const initTx: Transaction = {
                uuid: uuidv7(),
                date: new Date().toISOString().split('T')[0],
                amountRubles: parseFloat(account.balance || '0') || 0,
                amountAccountCurrency: account.balance || '0',
                accountName: account.name,
                accountCurrency: account.currency || 'RUB',
                category: 'баланс',
                description: 'Начальный баланс',
                type: 'balance_correct',
                member: null,
                exchangeRate: 1,
                transferReceiveAccountName: null,
                transferReceiveAmountAccountCurrency: null
            };
            const { error: txErr } = await indexedDBRepository.saveTransaction(initTx);
            if (txErr) {
                runInAction(() => {
                    this.error = txErr;
                });
                return;
            }
        } else {
            const { error } = await indexedDBRepository.saveAccount(account);
            if (error) {
                runInAction(() => {
                    this.error = error;
                });
                return;
            }
        }

        await this.loadData();
        this.closeAccountModal();
        this.recalculateBalances();
    }

    async openFolderModal(): Promise<void> {
        runInAction(() => { this.isLoading = true; });
        const authRes = await googleDriveService.ensureAuthenticated();
        runInAction(() => { this.isLoading = false; });
        
        if (authRes.error) {
            runInAction(() => { this.error = authRes.error; });
            alert(`Ошибка авторизации: ${authRes.error.message}`);
            return;
        }
        
        window.location.hash = 'modal-folder';
    }

    closeFolderModal(): void {
        if (window.location.hash === '#modal-folder') {
            window.history.back();
        } else {
            this.isFolderModalOpen = false;
        }
    }

    setView(view: 'transactions' | 'accounts' | 'settings' | 'db_explorer'): void {
        window.location.hash = view;
    }

    async clearTransactions(): Promise<void> {
        this.isLoading = true;
        const res = await indexedDBRepository.clearTransactions();
        if (res.error) {
            runInAction(() => {
                this.error = res.error;
                this.isLoading = false;
            });
            return;
        }
        await this.loadData();
        this.recalculateBalances();
    }

    async clearAccounts(): Promise<void> {
        this.isLoading = true;
        const res = await indexedDBRepository.clearAccounts();
        if (res.error) {
            runInAction(() => {
                this.error = res.error;
                this.isLoading = false;
            });
            return;
        }
        await this.loadData();
    }

    async clearDynamicData(): Promise<void> {
        this.isLoading = true;
        const res = await indexedDBRepository.resetAccountBalances();
        if (res.error) {
            runInAction(() => {
                this.error = res.error;
                this.isLoading = false;
            });
            return;
        }
        authStore.clearDynamicData();
        await this.loadData();
    }

    async clearAllLocalData(): Promise<void> {
        this.isLoading = true;
        try {
            await indexedDBRepository.clearAllData();
            await clearKeyval();
            googleDriveService.clearAuth();
            await authStore.signOut();

            if (typeof window !== 'undefined') {
                window.localStorage.clear();
                window.sessionStorage.clear();
            }

            runInAction(() => {
                this.transactions = [];
                this.accounts = [];
                this.syncFolderId = null;
                this.syncFolderName = null;
                this.googleAccountEmail = null;
                this.error = null;
                this.syncProgress = '';
            });
        } catch (err: unknown) {
            runInAction(() => {
                this.error = err instanceof Error ? err : new Error(String(err));
            });
        } finally {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }
}

export const store = new AppStore();
