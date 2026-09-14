/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { makeAutoObservable, runInAction } from "mobx";
import {
  SberProduct,
  SberSession,
  getStoredSberSession,
  setStoredSberSession,
  getSberAccounts,
  fetchSberProducts,
  parseSberCookies,
  SberWebAuthSession,
  SBER_DEFAULT_API_BASE,
} from "./infrastructure/sberbank";

export enum SberLoginStep {
  IDLE = "IDLE",
  COOKIE = "COOKIE",
  LOGIN = "LOGIN",
  SMS = "SMS",
  LOADING = "LOADING",
  SUCCESS = "SUCCESS",
}

export type SberLoginMode = "cookie" | "srp" | "pin";

export class SberAuthStore {
  // --- Observable State ---
  step: SberLoginStep = SberLoginStep.IDLE;
  loginMode: SberLoginMode = "cookie";

  cookieInput: string = "";
  loginInput: string = "";
  passwordInput: string = "";
  smsInput: string = "";
  pinInput: string = "42424";

  hasSavedPinSession: boolean = false;
  savedPin: string | null = null;

  isLoading: boolean = false;
  error: string | null = null;
  smsTimeout: number | null = null;

  // Account & Balance State
  isAuthenticated: boolean = false;
  accounts: SberProduct[] = [];
  totalBalance: number | null = null;
  isLoadingBalance: boolean = false;
  balanceError: string | null = null;

  private srpSession: SberWebAuthSession = new SberWebAuthSession();

  constructor() {
    makeAutoObservable(this);
  }

  // --- Actions ---

  setLoginMode(mode: SberLoginMode) {
    this.loginMode = mode;
    this.error = null;
  }

  setCookieInput(val: string) {
    this.cookieInput = val;
  }

  setLoginInput(val: string) {
    this.loginInput = val;
  }

  setPasswordInput(val: string) {
    this.passwordInput = val;
  }

  setSmsInput(val: string) {
    this.smsInput = val;
  }

  setPinInput(val: string) {
    this.pinInput = val;
  }

  /**
   * Resets the auth modal state and closes the dialog
   */
  reset() {
    this.step = SberLoginStep.IDLE;
    this.cookieInput = "";
    this.loginInput = "";
    this.passwordInput = "";
    this.smsInput = "";
    this.error = null;
    this.isLoading = false;
    this.smsTimeout = null;
  }

  /**
   * Starts the Sberbank login modal flow
   */
  async startLogin() {
    this.srpSession = new SberWebAuthSession();
    const session = await getStoredSberSession();
    const hasPin = Boolean(
      session &&
      session.pin &&
      session.cookies &&
      (session.cookies.sb_user || session.cookies["sb_user"])
    );

    runInAction(() => {
      this.hasSavedPinSession = hasPin;
      this.savedPin = session?.pin || null;
      this.pinInput = session?.pin || "42424";
      this.loginMode = hasPin ? "pin" : "cookie";
      this.step = SberLoginStep.COOKIE;
      this.cookieInput = "";
      this.loginInput = "";
      this.passwordInput = "";
      this.smsInput = "";
      this.error = null;
      this.isLoading = false;
      this.smsTimeout = null;
    });
  }

  /**
   * Initializes auth state from stored session
   */
  async init() {
    const session = await getStoredSberSession();
    if (session) {
      if (session.pin && session.cookies && (session.cookies.sb_user || session.cookies["sb_user"])) {
        runInAction(() => {
          this.hasSavedPinSession = true;
          this.savedPin = session.pin || null;
          this.pinInput = session.pin || "42424";
        });
      }
      if (session.ufsSession && session.ufsToken) {
        runInAction(() => {
          this.isAuthenticated = true;
        });
        await this.loadBalance();
        return;
      }
    }

    runInAction(() => {
      this.isAuthenticated = false;
      this.accounts = [];
      this.totalBalance = null;
    });

    // Auto-reconnect using saved PIN from memory
    if (session && session.pin && session.cookies && (session.cookies.sb_user || session.cookies["sb_user"])) {
      await this.submitPinLogin(session.pin);
    }
  }

  /**
   * Authenticate using direct cookie string and optional PIN for session persistence
   */
  async submitCookieLogin() {
    const pin = (this.pinInput || "").trim();
    if (pin && pin.length !== 5) {
      this.error = "PIN должен состоять из 5 цифр";
      return;
    }

    this.isLoading = true;
    this.error = null;

    const { ufsSession, ufsToken, cookies } = parseSberCookies(this.cookieInput);
    if (!ufsSession || !ufsToken) {
      runInAction(() => {
        this.isLoading = false;
        this.error =
          "Не удалось найти UFS-SESSION и UFS-TOKEN. Скопируйте cookies из DevTools (online.sberbank.ru).";
      });
      return;
    }

    const hasPin = Boolean(pin.length === 5 && (cookies.sb_user || cookies["sb_user"]));

    const testSession: SberSession = {
      ufsSession,
      ufsToken,
      cookies,
      ...(hasPin ? { pin } : {}),
      apiBase: SBER_DEFAULT_API_BASE,
      lastUpdated: Date.now(),
    };

    const res = await fetchSberProducts(testSession);
    if (res.error !== null) {
      runInAction(() => {
        this.isLoading = false;
        this.error = res.error.message || "Ошибка проверки сессии СберБанка";
      });
      return;
    }

    await setStoredSberSession(testSession);

    runInAction(() => {
      this.isAuthenticated = true;
      this.step = SberLoginStep.SUCCESS;
      this.isLoading = false;
      this.hasSavedPinSession = hasPin;
      this.savedPin = hasPin ? pin : null;
      this.accounts = res.data;
      this.calculateTotalBalance(res.data);
    });
  }

  /**
   * Starts SRP login with Login and Password -> requests SMS from Sberbank
   */
  async submitSrpLogin() {
    if (!this.loginInput.trim() || !this.passwordInput) {
      this.error = "Введите логин и пароль";
      return;
    }

    this.isLoading = true;
    this.error = null;

    const res = await this.srpSession.startLogin(this.loginInput, this.passwordInput);
    if (res.error !== null) {
      runInAction(() => {
        this.isLoading = false;
        this.error = res.error.message || "Ошибка авторизации в СберБанке";
      });
      return;
    }

    runInAction(() => {
      this.isLoading = false;
      this.step = SberLoginStep.SMS;
      this.smsInput = "";
      this.smsTimeout = res.data.timeout || 120;
    });
  }

  /**
   * Authenticate using saved 5-digit PIN (without SMS)
   */
  async submitPinLogin(pinOverride?: string) {
    const session = await getStoredSberSession();
    const pin = (pinOverride || this.pinInput || session?.pin || "").trim();
    if (!pin || pin.length !== 5) {
      this.error = "PIN должен состоять из 5 цифр";
      return;
    }

    if (!session?.cookies || (!session.cookies.sb_user && !session.cookies["sb_user"])) {
      this.error = "Для входа по PIN необходима предварительная авторизация в этом браузере";
      return;
    }

    this.isLoading = true;
    this.error = null;

    const res = await this.srpSession.loginWithPin(pin, session.cookies);
    if (res.error !== null) {
      runInAction(() => {
        this.isLoading = false;
        this.error = res.error.message || "Ошибка входа по PIN-коду";
      });
      return;
    }

    runInAction(() => {
      this.isAuthenticated = true;
      this.step = SberLoginStep.SUCCESS;
      this.isLoading = false;
      this.hasSavedPinSession = true;
      this.savedPin = pin;
    });

    await this.loadBalance();
  }

  /**
   * Submits SMS OTP code to finish web login
   */
  async submitSmsCode() {
    const code = this.smsInput.trim();
    if (!code) {
      this.error = "Введите код из СМС";
      return;
    }

    const pinToEnroll = (this.pinInput || "42424").trim();
    if (pinToEnroll && pinToEnroll.length !== 5) {
      this.error = "PIN должен состоять из 5 цифр";
      return;
    }

    this.isLoading = true;
    this.error = null;

    const res = await this.srpSession.confirmOtp(code, pinToEnroll);
    if (res.error !== null) {
      runInAction(() => {
        this.isLoading = false;
        this.error = res.error.message || "Ошибка подтверждения СМС-кода";
      });
      return;
    }

    runInAction(() => {
      this.isAuthenticated = true;
      this.step = SberLoginStep.SUCCESS;
      this.isLoading = false;
      this.smsInput = "";
      this.hasSavedPinSession = true;
      this.savedPin = pinToEnroll;
    });

    await this.loadBalance();
  }

  /**
   * General submit handler router
   */
  async submit() {
    if (this.loginMode === "pin") {
      await this.submitPinLogin();
    } else if (this.loginMode === "cookie") {
      await this.submitCookieLogin();
    } else if (this.step === SberLoginStep.LOGIN || this.step === SberLoginStep.COOKIE) {
      await this.submitSrpLogin();
    } else if (this.step === SberLoginStep.SMS) {
      await this.submitSmsCode();
    }
  }

  private calculateTotalBalance(prods: SberProduct[]) {
    // To avoid double-counting, identify accounts backing active cards
    const cardAccounts = new Set(
      prods
        .filter((p) => p.type === "card" && p.cardAccount)
        .map((p) => p.cardAccount)
    );

    let total = 0;
    let count = 0;

    for (const prod of prods) {
      if (prod.isBlocked || prod.type === "deposit") continue;
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
          res.error.message.includes("Не авторизован") ||
          res.error.message.includes("истекла") ||
          res.error.message.includes("401") ||
          res.error.message.includes("403")
        ) {
          this.isAuthenticated = false;
        }
        return;
      }

      this.accounts = res.data;
      this.calculateTotalBalance(res.data);
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
