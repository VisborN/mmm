/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { makeAutoObservable, runInAction } from "mobx";
import {
  SberbankAuthSession,
  SberProduct,
  getStoredSberSession,
  setStoredSberSession,
  getSberAccounts,
  SBER_DEFAULT_PIN,
} from "./infrastructure/sberbank";

export enum SberLoginStep {
  IDLE = "IDLE",
  LOGIN = "LOGIN",
  SMS = "SMS",
  LOADING = "LOADING",
  SUCCESS = "SUCCESS",
}

export class SberAuthStore {
  // --- Observable State ---
  step: SberLoginStep = SberLoginStep.IDLE;
  inputValue: string = "";
  isLoading: boolean = false;
  error: string | null = null;
  attemptsRemain: number | null = null;
  maskedLogin: string | null = null;

  // Account & Balance State
  isAuthenticated: boolean = false;
  accounts: SberProduct[] = [];
  totalBalance: number | null = null;
  isLoadingBalance: boolean = false;
  balanceError: string | null = null;

  private session: SberbankAuthSession = new SberbankAuthSession();

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
    this.step = SberLoginStep.IDLE;
    this.inputValue = "";
    this.error = null;
    this.isLoading = false;
    this.attemptsRemain = null;
    this.maskedLogin = null;
  }

  /**
   * Starts the Sberbank login/registration flow
   */
  startLogin() {
    this.session = new SberbankAuthSession();
    this.step = SberLoginStep.LOGIN;
    this.inputValue = "";
    this.error = null;
    this.isLoading = false;
    this.attemptsRemain = null;
    this.maskedLogin = null;
  }

  /**
   * Initializes auth state from stored session
   */
  async init() {
    const session = await getStoredSberSession();
    if (session && session.mGuid) {
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

    if (this.step === SberLoginStep.LOGIN) {
      const rawInput = this.inputValue.trim();
      const res = await this.session.register(rawInput);

      if (res.error !== null) {
        runInAction(() => {
          this.error = res.error.message || "Ошибка при регистрации устройства в СберБанке";
          this.isLoading = false;
        });
        return;
      }

      runInAction(() => {
        this.step = SberLoginStep.SMS;
        this.inputValue = "";
        this.attemptsRemain = res.data.attemptsRemain ?? null;
        this.maskedLogin = rawInput;
        this.isLoading = false;
      });
    } else if (this.step === SberLoginStep.SMS) {
      const smsCode = this.inputValue.trim();
      const confirmRes = await this.session.confirm(smsCode, SBER_DEFAULT_PIN);

      if (confirmRes.error !== null) {
        runInAction(() => {
          this.error = confirmRes.error.message || "Неверный СМС-код";
          this.attemptsRemain = this.session.attemptsRemain;
          this.isLoading = false;
        });
        return;
      }

      // Automatically log in using the newly created PIN & mGUID
      const mGuid = this.session.mGuid;
      if (!mGuid) {
        runInAction(() => {
          this.error = "Ошибка сессии: отсутствует mGUID";
          this.isLoading = false;
        });
        return;
      }

      const loginRes = await this.session.login(mGuid, SBER_DEFAULT_PIN);
      if (loginRes.error !== null) {
        runInAction(() => {
          this.error = loginRes.error.message || "Ошибка входа после подтверждения";
          this.isLoading = false;
        });
        return;
      }

      runInAction(() => {
        this.isAuthenticated = true;
        this.step = SberLoginStep.SUCCESS;
        this.inputValue = "";
        this.isLoading = false;
      });

      await this.loadBalance();
    }
  }

  /**
   * Fetches accounts and calculates current total RUB balance
   */
  async loadBalance() {
    runInAction(() => {
      this.isLoadingBalance = true;
      this.balanceError = null;
    });

    const res = await getSberAccounts();

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

      // To avoid double-counting, identify accounts backing active cards
      const cardAccounts = new Set(
        res.data
          .filter((p) => p.type === "card" && p.cardAccount)
          .map((p) => p.cardAccount)
      );

      let total = 0;
      let count = 0;

      for (const prod of res.data) {
        if (prod.isBlocked || prod.type === "loan") continue;
        if (prod.type === "account" && prod.number && cardAccounts.has(prod.number)) {
          // Skip card-backing account already accounted for in card balance
          continue;
        }

        const curr = prod.currencyCode.toUpperCase();
        if (
          !curr ||
          curr === "RUB" ||
          curr === "643" ||
          curr === "810" ||
          prod.currencyName.includes("руб") ||
          prod.currencyName.includes("₽")
        ) {
          total += prod.balance;
          count++;
        }
      }

      this.totalBalance = count > 0 ? Math.round(total * 100) / 100 : null;
      this.isAuthenticated = true;
    });
  }

  /**
   * Signs out of Sberbank, clearing saved session and cached balances
   */
  async signOut() {
    await setStoredSberSession(null);
    runInAction(() => {
      this.isAuthenticated = false;
      this.accounts = [];
      this.totalBalance = null;
      this.balanceError = null;
      this.reset();
    });
  }
}

export const sberAuthStore = new SberAuthStore();
