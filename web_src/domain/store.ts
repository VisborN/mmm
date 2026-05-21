import { makeAutoObservable, runInAction } from "mobx";
import { Account, Transaction } from "./types";
import { indexedDBRepository } from "../infrastructure/repository";
import { googleSyncService } from "./google_sync_service";
import { get, set } from "idb-keyval";

declare const __WORKER_URL__: string;

export class AppStore {
    transactions: Transaction[] = [];
    accounts: Account[] = [];

    currentView: 'transactions' | 'accounts' | 'settings' | 'db_explorer' = 'transactions';

    isTransactionModalOpen: boolean = false;
    currentTransaction: Transaction | null = null;

    isAccountModalOpen: boolean = false;
    currentAccount: Account | null = null;

    isLoading: boolean = true;
    syncProgress: string = '';
    error: Error | null = null;

    isRecalculating: boolean = false;

    syncFolderId: string | null = null;
    syncFolderName: string | null = null;

    constructor() {
        makeAutoObservable(this);
    }

    async setSyncFolder(id: string | null, name: string | null): Promise<void> {
        this.syncFolderId = id;
        this.syncFolderName = name;
        await set('syncFolderId', id);
        await set('syncFolderName', name);
    }

    async exportToGoogleDrive(): Promise<void> {
        this.isLoading = true;
        this.syncProgress = 'Подготовка к экспорту...';
        const result = await googleSyncService.exportToGoogleDrive(this.transactions, this.syncFolderId || undefined, (progress) => {
            runInAction(() => { this.syncProgress = progress; });
        });
        runInAction(() => {
            if (result.error) {
                this.error = result.error;
                alert(`Ошибка экспорта: ${result.error.message}`);
            } else {
                this.error = null;
                alert('Экспорт успешно завершен!');
            }
            this.isLoading = false;
            this.syncProgress = '';
        });
    }

    async importFromGoogleDrive(): Promise<void> {
        this.isLoading = true;
        this.syncProgress = 'Поиск файлов...';
        
        const result = await googleSyncService.importFromGoogleDrive(this.syncFolderId || undefined, (progress) => {
            runInAction(() => { this.syncProgress = progress; });
        });
        
        if (result.error) {
            runInAction(() => { this.error = result.error; this.isLoading = false; this.syncProgress = ''; });
            return;
        }

        this.syncProgress = 'Сохранение в базу данных...';
        const replaceRes = await indexedDBRepository.replaceAllTransactions(result.data);
        if (replaceRes.error) {
            runInAction(() => { this.error = replaceRes.error; this.isLoading = false; this.syncProgress = ''; });
            return;
        }

        await this.loadData();
        runInAction(() => { this.isLoading = false; this.syncProgress = ''; this.error = null; });
        this.recalculateBalances();
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
    }

    openTransactionModal(transaction?: Transaction): void {
        this.currentTransaction = transaction || null;
        this.isTransactionModalOpen = true;
    }

    closeTransactionModal(): void {
        this.currentTransaction = null;
        this.isTransactionModalOpen = false;
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
        this.isAccountModalOpen = true;
    }

    closeAccountModal(): void {
        this.currentAccount = null;
        this.isAccountModalOpen = false;
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

    setView(view: 'transactions' | 'accounts' | 'settings' | 'db_explorer'): void {
        this.currentView = view;
    }
}

export const store = new AppStore();
