/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type */
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

    try {
      if (this.step === LoginStep.PHONE) {
        // Logic for Phone Login
        const needsOtp = await this.authService.loginPhone(this.inputValue);

        // runInAction is required for updating state after an await
        runInAction(() => {
          this.step = needsOtp ? LoginStep.OTP : LoginStep.PASSWORD;
          this.inputValue = "";
        });
      }
      else if (this.step === LoginStep.OTP) {
        // Logic for SMS Confirmation
        const ok = await this.authService.confirmOTP(this.inputValue);
        runInAction(() => {
          if (ok) {
            this.step = LoginStep.PASSWORD;
            this.inputValue = "";
          } else {
            this.error = "Invalid OTP code";
          }
        });
      }
      else if (this.step === LoginStep.PASSWORD) {
        // Logic for Password Login
        const ok = await this.authService.loginPassword(this.inputValue);
        runInAction(() => {
          if (ok) {
            this.step = LoginStep.SUCCESS;
          } else {
            this.error = "Incorrect password";
          }
        });
      }
    } catch (e: any) {
      runInAction(() => {
        this.error = e.message || "An unexpected error occurred";
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  /**
   * Fetches operations and updates the local observable list
   */
  async loadOperations() {
    this.isLoading = true;
    try {
      const data = await this.authService.getOperations();
      runInAction(() => {
        this.operations = data;
      });
    } catch (e: any) {
      runInAction(() => this.error = e.message);
    } finally {
      runInAction(() => this.isLoading = false);
    }
  }
}

// Export a single instance to be used across the app (Singleton pattern)
export const authStore = new AuthStore();