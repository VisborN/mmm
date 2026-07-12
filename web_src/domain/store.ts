import { makeAutoObservable, runInAction } from "mobx";
import { Account, Transaction } from "./types";
import { indexedDBRepository } from "../infrastructure/repository";
import { googleSyncService } from "./google_sync_service";
import { get, set } from "idb-keyval";
import { googleDriveService } from "../infrastructure/google_drive";

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
        this.isLoading = true;
        this.syncProgress = 'Аутентификация...';
        
        const authRes = await googleDriveService.ensureAuthenticated();
        if (authRes.error) {
            runInAction(() => {
                this.error = authRes.error;
                this.isLoading = false;
                this.syncProgress = '';
            });
            return;
        }

        this.syncProgress = 'Подготовка к экспорту...';
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
        this.isLoading = true;
        this.syncProgress = 'Аутентификация...';
        
        const authRes = await googleDriveService.ensureAuthenticated();
        if (authRes.error) {
            runInAction(() => {
                this.error = authRes.error;
                this.isLoading = false;
                this.syncProgress = '';
            });
            return;
        }

        this.syncProgress = 'Поиск файлов...';
        try {
            const result = await googleSyncService.importFromGoogleDrive(this.syncFolderId || undefined, (progress) => {
                runInAction(() => { this.syncProgress = progress; });
            });
            
            if (result.error) {
                runInAction(() => { this.error = result.error; });
                return;
            }

            this.syncProgress = 'Сохранение в базу данных...';
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

    async loadData(): Promise<void> {
        this.isLoading = true;
        this.error = null;

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
            });
            return;
        }

        const { data: txData, error: txErr } = await indexedDBRepository.getTransactions();
        if (txErr) {
            runInAction(() => {
                this.error = txErr;
                this.isLoading = false;
            });
            return;
        }

        runInAction(() => {
            this.accounts = accountsData;
            this.transactions = txData;
            this.isLoading = false;
        });

        this.loadGoogleAccountEmail();
    }

    openTransactionModal(transaction?: Transaction): void {
        this.currentTransaction = transaction || null;
        window.location.hash = 'modal-tx';
    }

    closeTransactionModal(): void {
        if (window.location.hash === '#modal-tx') {
            window.history.back();
        } else {
            this.isTransactionModalOpen = false;
            this.currentTransaction = null;
        }
    }

    async saveTransaction(transaction: Transaction): Promise<void> {
        const { error } = await indexedDBRepository.saveTransaction(transaction);
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
        window.location.hash = 'modal-account';
    }

    closeAccountModal(): void {
        if (window.location.hash === '#modal-account') {
            window.history.back();
        } else {
            this.isAccountModalOpen = false;
            this.currentAccount = null;
        }
    }

    async saveAccount(account: Account): Promise<void> {
        const { error } = await indexedDBRepository.saveAccount(account);
        if (error) {
            runInAction(() => {
                this.error = error;
            });
            return;
        }

        await this.loadData();
        this.closeAccountModal();
    }

    async openFolderModal(): Promise<void> {
        this.isLoading = true;
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
}

export const store = new AppStore();
