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
   * Stub for legacy operations
   */
  async loadOperations() {
    // In current iteration operations are not requested, kept for type compatibility
    return;
  }
}

// Export singleton instance
export const authStore = new AuthStore();