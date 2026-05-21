/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { makeAutoObservable, runInAction } from "mobx";
import { TinkoffAuthService } from "./tinkoff_auth_service";
import { TinkoffOperation } from "./domain/tinkoff_operation";

export enum LoginStep {
  IDLE = "IDLE",
  PHONE = "PHONE",
  OTP = "OTP",
  PASSWORD = "PASSWORD",
  LOADING = "LOADING",
  SUCCESS = "SUCCESS"
}

export class AuthStore {
  // --- Observable State ---
  step: LoginStep = LoginStep.IDLE;
  inputValue: string = "";
  isLoading: boolean = false;
  error: string | null = null;
  operations: TinkoffOperation[] = [];

  private authService = new TinkoffAuthService();

  constructor() {
    // makeAutoObservable automatically makes properties observable
    // and methods into actions.
    makeAutoObservable(this);
  }

  // --- Actions ---

  setInputValue(val: string) {
    this.inputValue = val;
  }

  /**
   * Resets the store to initial state
   */
  reset() {
    this.step = LoginStep.PHONE;
    this.inputValue = "";
    this.error = null;
    this.isLoading = false;
  }

  /**
   * The main submission logic loop
   */
  async submit() {
    this.isLoading = true;
    this.error = null;

    if (this.step === LoginStep.PHONE) {
      // Logic for Phone Login
      const needsOtpRes = await this.authService.loginPhone(this.inputValue);
      
      runInAction(() => {
        if (needsOtpRes.error) {
          this.error = needsOtpRes.error.message || "An unexpected error occurred";
        } else {
          this.step = needsOtpRes.data ? LoginStep.OTP : LoginStep.PASSWORD;
          this.inputValue = "";
        }
        this.isLoading = false;
      });
    }
    else if (this.step === LoginStep.OTP) {
      // Logic for SMS Confirmation
      const okRes = await this.authService.confirmOTP(this.inputValue);
      
      runInAction(() => {
        if (okRes.error) {
          this.error = okRes.error.message || "An unexpected error occurred";
        } else if (okRes.data) {
          this.step = LoginStep.PASSWORD;
          this.inputValue = "";
        } else {
          this.error = "Invalid OTP code";
        }
        this.isLoading = false;
      });
    }
    else if (this.step === LoginStep.PASSWORD) {
      // Logic for Password Login
      const okRes = await this.authService.loginPassword(this.inputValue);
      
      runInAction(() => {
        if (okRes.error) {
          this.error = okRes.error.message || "An unexpected error occurred";
        } else if (okRes.data) {
          this.step = LoginStep.SUCCESS;
        } else {
          this.error = "Incorrect password";
        }
        this.isLoading = false;
      });
    }
  }

  /**
   * Fetches operations and updates the local observable list
   */
  async loadOperations() {
    this.isLoading = true;
    const res = await this.authService.getOperations();
    
    runInAction(() => {
      if (res.error) {
        this.error = res.error.message;
      } else {
        this.operations = res.data;
      }
      this.isLoading = false;
    });
  }
}

// Export a single instance to be used across the app (Singleton pattern)
export const authStore = new AuthStore();