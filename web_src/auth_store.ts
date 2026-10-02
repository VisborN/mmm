/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { makeAutoObservable, runInAction } from "mobx";
import {
  TBankAuthSession,
  TBankAccount,
  getStoredTokens,
  setStoredTokens,
  getTBankAccounts,
} from "./infrastructure/tbank";
import { TinkoffOperation } from "./domain/tinkoff_operation";
import { bankSyncService } from "./domain/bank_sync_service";

export enum LoginStep {
  IDLE = "IDLE",
  PHONE = "PHONE",
  OTP = "OTP",
  TOTP = "TOTP",
  PASSWORD = "PASSWORD",
  LOADING = "LOADING",
  SUCCESS = "SUCCESS",
}

export class AuthStore {
  // --- Observable State ---
  step: LoginStep = LoginStep.IDLE;
  inputValue: string = "";
  isLoading: boolean = false;
  error: string | null = null;

  // Account & Balance State
  isAuthenticated: boolean = false;
  accounts: TBankAccount[] = [];
  totalBalance: number | null = null;
  isLoadingBalance: boolean = false;
  balanceError: string | null = null;
  isSyncing: boolean = false;
  syncProgress: string = "";
  syncPercent: number = 0;
  syncError: string | null = null;
  private abortController: { aborted: boolean } | null = null;

  // Auth flow metadata
  maskedPhone: string | null = null;
  otpLength: number = 6;
  userName: string | null = null;

  // Legacy operations support
  operations: TinkoffOperation[] = [];

  private session: TBankAuthSession = new TBankAuthSession();

  constructor() {
    makeAutoObservable(this);
  }

  // --- Actions ---

  setInputValue(val: string) {
    this.inputValue = val;
  }

  /**
   * Resets the auth modal state and closes the dialog
   */
  reset() {
    this.step = LoginStep.IDLE;
    this.inputValue = "";
    this.error = null;
    this.isLoading = false;
    this.maskedPhone = null;
    this.userName = null;
  }

  /**
   * Starts the login flow
   */
  startLogin() {
    this.session = new TBankAuthSession();
    this.step = LoginStep.PHONE;
    this.inputValue = "";
    this.error = null;
    this.isLoading = false;
    this.maskedPhone = null;
    this.userName = null;
  }

  /**
   * Checks stored tokens and initializes authentication / balance state
   */
  async init() {
    const tokens = await getStoredTokens();
    if (tokens && tokens.accessToken) {
      runInAction(() => {
        this.isAuthenticated = true;
      });
      await this.loadBalance();
    } else {
      runInAction(() => {
        this.isAuthenticated = false;
        this.accounts = [];
        this.totalBalance = null;
      });
    }
  }

  /**
   * Submits the current step of the login flow
   */
  async submit() {
    this.isLoading = true;
    this.error = null;

    if (this.step === LoginStep.PHONE) {
      const res = await this.session.submitPhone(this.inputValue);

      if (res.error !== null) {
        runInAction(() => {
          this.error = res.error.message || "Ошибка при вводе номера телефона";
          this.isLoading = false;
        });
        return;
      }

      if (res.data.step === "totp") {
        runInAction(() => {
          this.step = LoginStep.TOTP;
          this.inputValue = "";
          this.otpLength = 6;
          this.isLoading = false;
        });
      } else if (res.data.step === "otp") {
        runInAction(() => {
          this.step = LoginStep.OTP;
          this.inputValue = "";
          this.otpLength = res.data.otpLength || 6;
          this.maskedPhone = res.data.phoneMasked || null;
          this.isLoading = false;
        });
      } else if (res.data.step === "password") {
        runInAction(() => {
          this.step = LoginStep.PASSWORD;
          this.inputValue = "";
          this.userName = res.data.userName || null;
          this.isLoading = false;
        });
      } else if (res.data.step === "complete" && res.data.code) {
        await this.handleCodeExchange(res.data.code);
      } else {
        runInAction(() => {
          this.error = "Неизвестный ответ от сервера";
          this.isLoading = false;
        });
      }
    } else if (this.step === LoginStep.TOTP) {
      const res = await this.session.submitTotp(this.inputValue);

      if (res.error !== null) {
        runInAction(() => {
          this.error = res.error.message || "Неверный код подтверждения";
          this.isLoading = false;
        });
        return;
      }

      if (res.data.step === "password") {
        runInAction(() => {
          this.step = LoginStep.PASSWORD;
          this.inputValue = "";
          this.userName = res.data.userName || null;
          this.isLoading = false;
        });
      } else if (res.data.step === "otp") {
        runInAction(() => {
          this.step = LoginStep.OTP;
          this.inputValue = "";
          this.otpLength = res.data.otpLength || 6;
          this.maskedPhone = res.data.phoneMasked || null;
          this.isLoading = false;
        });
      } else if (res.data.step === "complete" && res.data.code) {
        await this.handleCodeExchange(res.data.code);
      } else {
        runInAction(() => {
          this.error = "Не удалось подтвердить код";
          this.isLoading = false;
        });
      }
    } else if (this.step === LoginStep.OTP) {
      const res = await this.session.submitOtp(this.inputValue);

      if (res.error !== null) {
        runInAction(() => {
          this.error = res.error.message || "Неверный СМС-код";
          this.isLoading = false;
        });
        return;
      }

      if (res.data.step === "password") {
        runInAction(() => {
          this.step = LoginStep.PASSWORD;
          this.inputValue = "";
          this.userName = res.data.userName || null;
          this.isLoading = false;
        });
      } else if (res.data.step === "complete" && res.data.code) {
        await this.handleCodeExchange(res.data.code);
      } else {
        runInAction(() => {
          this.error = "Не удалось подтвердить СМС-код";
          this.isLoading = false;
        });
      }
    } else if (this.step === LoginStep.PASSWORD) {
      const res = await this.session.submitPassword(this.inputValue);

      if (res.error !== null) {
        runInAction(() => {
          this.error = res.error.message || "Неверный пароль";
          this.isLoading = false;
        });
        return;
      }

      if (res.data.step === "complete" && res.data.code) {
        await this.handleCodeExchange(res.data.code);
      } else {
        runInAction(() => {
          this.error = "Не удалось завершить авторизацию";
          this.isLoading = false;
        });
      }
    }
  }

  /**
   * Skips TOTP and requests an SMS code instead
   */
  async fallbackToSms() {
    this.isLoading = true;
    this.error = null;

    const res = await this.session.skipTotp();
    if (res.error !== null) {
      runInAction(() => {
        this.error = res.error.message || "Не удалось отправить СМС-код";
        this.isLoading = false;
      });
      return;
    }

    if (res.data.step === "otp") {
      runInAction(() => {
        this.step = LoginStep.OTP;
        this.inputValue = "";
        this.otpLength = res.data.otpLength || 6;
        this.maskedPhone = res.data.phoneMasked || null;
        this.isLoading = false;
      });
    } else if (res.data.step === "password") {
      runInAction(() => {
        this.step = LoginStep.PASSWORD;
        this.inputValue = "";
        this.userName = res.data.userName || null;
        this.isLoading = false;
      });
    } else if (res.data.step === "complete" && res.data.code) {
      await this.handleCodeExchange(res.data.code);
    } else {
      runInAction(() => {
        this.error = "Не удалось переключиться на СМС";
        this.isLoading = false;
      });
    }
  }

  private async handleCodeExchange(code: string) {
    const exchangeRes = await this.session.exchangeCode(code);
    if (exchangeRes.error !== null) {
      runInAction(() => {
        this.error = exchangeRes.error.message || "Ошибка обмена кода на токены";
        this.isLoading = false;
      });
      return;
    }

    runInAction(() => {
      this.isAuthenticated = true;
      this.step = LoginStep.SUCCESS;
      this.inputValue = "";
      this.isLoading = false;
    });

    await this.loadBalance();
  }

  /**
   * Fetches accounts and calculates current total balance
   */
  async loadBalance() {
    runInAction(() => {
      this.isLoadingBalance = true;
      this.balanceError = null;
    });

    const res = await getTBankAccounts();

    runInAction(() => {
      this.isLoadingBalance = false;
      if (res.error !== null) {
        this.balanceError = res.error.message;
        if (
          res.error.message.includes("Not authenticated") ||
          res.error.message.includes("Unauthorized")
        ) {
          this.isAuthenticated = false;
        }
        return;
      }

      this.accounts = res.data;

      // Calculate total balance across visible non-external accounts
      let total = 0;
      let count = 0;
      for (const acc of res.data) {
        if (
          acc.accountType !== "ExternalAccount" &&
          acc.moneyAmount &&
          typeof acc.moneyAmount.value === "number"
        ) {
          const curr = acc.moneyAmount.currency?.name || "";
          // Sum up primary RUB balances
          if (!curr || curr === "RUB" || acc.moneyAmount.currency?.code === 643) {
            total += acc.moneyAmount.value;
            count++;
          }
        }
      }

      this.totalBalance = count > 0 ? Math.round(total * 100) / 100 : null;
      this.isAuthenticated = true;
    });
  }

  /**
   * Signs out of T-Bank, clearing tokens and cached balance
   */
  async signOut() {
    await setStoredTokens(null);
    runInAction(() => {
      this.isAuthenticated = false;
      this.accounts = [];
      this.totalBalance = null;
      this.balanceError = null;
      this.reset();
    });
  }

  /**
   * Clears dynamic cached data (balances, accounts) without signing out
   */
  clearDynamicData() {
    runInAction(() => {
      this.totalBalance = null;
      this.balanceError = null;
      this.accounts = [];
    });
  }

  /**
   * Syncs recent operations (last 35 days) for all accounts
   */
  async syncRecentOperations(onSuccess?: () => void) {
    if (this.isSyncing) return;
    if (this.accounts.length === 0) {
      await this.loadBalance();
      if (this.accounts.length === 0) {
        runInAction(() => {
          this.syncError = "Нет счетов для синхронизации";
        });
        return;
      }
    }

    runInAction(() => {
      this.isSyncing = true;
      this.syncProgress = "Синхронизация последних операций...";
      this.syncPercent = 10;
      this.syncError = null;
    });

    const accountIds = this.accounts.map((a) => a.id);
    const syncRes = await bankSyncService.syncIncremental(accountIds);

    runInAction(() => {
      this.isSyncing = false;
      this.syncPercent = 100;
      if (syncRes.error !== null) {
        this.syncError = syncRes.error.message;
      } else {
        this.syncProgress = `Синхронизировано: ${syncRes.data.syncedOpsCount} операций (+${syncRes.data.createdTxCount} новых, ${syncRes.data.updatedTxCount} обновлено)`;
      }
    });

    if (syncRes.error === null && onSuccess) {
      onSuccess();
    }
  }

  /**
   * Starts full historical sync back to 2010 month by month
   */
  async syncFullHistory(onSuccess?: () => void) {
    if (this.isSyncing) return;
    if (this.accounts.length === 0) {
      await this.loadBalance();
      if (this.accounts.length === 0) {
        runInAction(() => {
          this.syncError = "Нет счетов для синхронизации";
        });
        return;
      }
    }

    const abortSignal = { aborted: false };
    this.abortController = abortSignal;

    runInAction(() => {
      this.isSyncing = true;
      this.syncProgress = "Запуск полной загрузки операций...";
      this.syncPercent = 0;
      this.syncError = null;
    });

    const accountIds = this.accounts.map((a) => a.id);
    const syncRes = await bankSyncService.syncFullHistory(accountIds, {
      onProgress: (msg, percent) => {
        runInAction(() => {
          this.syncProgress = msg;
          if (percent !== undefined) this.syncPercent = percent;
        });
      },
      shouldAbort: () => abortSignal.aborted,
    });

    runInAction(() => {
      this.isSyncing = false;
      this.abortController = null;
      if (syncRes.error !== null) {
        this.syncError = syncRes.error.message;
      } else {
        this.syncPercent = 100;
        this.syncProgress = `Полная загрузка завершена: ${syncRes.data.syncedOpsCount} операций`;
      }
    });

    if (syncRes.error === null && onSuccess) {
      onSuccess();
    }
  }

  /**
   * Cancels in-progress sync
   */
  cancelSync() {
    if (this.abortController) {
      this.abortController.aborted = true;
      runInAction(() => {
        this.syncProgress = "Отмена синхронизации...";
      });
    }
  }

  /**
   * Resets local bank operations for T-Bank
   */
  async resetBankOperations(onSuccess?: () => void) {
    runInAction(() => {
      this.isSyncing = true;
      this.syncProgress = "Очистка локальных операций Т-Банка...";
      this.syncError = null;
    });

    const res = await bankSyncService.resetBankOperations("tbank");

    runInAction(() => {
      this.isSyncing = false;
      if (res.error !== null) {
        this.syncError = res.error.message;
      } else {
        this.syncProgress = "Операции Т-Банка очищены из локальной базы";
      }
    });

    if (res.error === null && onSuccess) {
      onSuccess();
    }
  }

  /**
   * Stub for legacy operations
   */
  async loadOperations() {
    return;
  }
}

// Export singleton instance
export const authStore = new AuthStore();