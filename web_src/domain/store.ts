import { makeAutoObservable, runInAction } from "mobx";
import { Account, Transaction } from "./types";
import { indexedDBRepository } from "../infrastructure/repository";

export class AppStore {
    transactions: Transaction[] = [];
    accounts: Account[] = [];

    isTransactionModalOpen: boolean = false;
    currentTransaction: Transaction | null = null;

    isLoading: boolean = true;
    error: Error | null = null;

    constructor() {
        makeAutoObservable(this);
    }

    async loadData(): Promise<void> {
        this.isLoading = true;
        this.error = null;

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
            this.accounts = accountsData || [];
            this.transactions = txData || [];
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
    }
}

export const store = new AppStore();
