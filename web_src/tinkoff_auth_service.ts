/* eslint-disable @typescript-eslint/explicit-function-return-type */
import "ts-error-as-value/lib/globals";
import * as tinkoff_server from './infrastructure/tinkoff';
import { JsonStore } from './infrastructure/json_store';
import { TinkoffOperation } from './domain/tinkoff_operation';

export class TinkoffAuthService {
  private static PWD_KEY = "tinkoff_password";
  private static WUID_KEY = "tinkoff_wuid";
  private static PHONE_KEY = "tinkoff_phone";
  private static SESSION_KEY = "tinkoff_session";
  private static TIMEOUT_KEY = "tinkoff_session_timeout";
  private static START_KEY = "tinkoff_session_start";
  private static LOGGED_PHONE_KEY = "tinkoff_logged_with_phone";

  private origin = "web%2Cib5%2Cplatform";
  private operationTicket = "";

  // --- Persistent Getters/Setters (mimicking SharedPreferences) ---

  async getWuid() { const r = await JsonStore.getJson<string>(TinkoffAuthService.WUID_KEY); return r.error ? "" : (r.data || ""); }
  async setWuid(val: string) { await JsonStore.setJson(TinkoffAuthService.WUID_KEY, val); }

  async getSession() { const r = await JsonStore.getJson<string>(TinkoffAuthService.SESSION_KEY); return r.error ? "" : (r.data || ""); }
  async setSession(val: string) { await JsonStore.setJson(TinkoffAuthService.SESSION_KEY, val); }

  async getPhone() { const r = await JsonStore.getJson<string>(TinkoffAuthService.PHONE_KEY); return r.error ? "" : (r.data || ""); }
  async setPhone(val: string) { await JsonStore.setJson(TinkoffAuthService.PHONE_KEY, val); }

  async getPassword() { const r = await JsonStore.getJson<string>(TinkoffAuthService.PWD_KEY); return r.error ? "" : (r.data || ""); }
  async setPassword(val: string) { await JsonStore.setJson(TinkoffAuthService.PWD_KEY, val); }

  // --- Auth Logic ---

  /**
   * Manages session lifecycle. Mimics getSession in Dart.
   */
  async refreshSession(): Promise<Result<string, Error>> {
    let wuid = await this.getWuid();
    const session = await this.getSession();

    if (!wuid) {
      const res = await tinkoff_server.getWebUser();
      if (res.error !== null) {
        return err(new AggregateError([res.error], "Failed to get web user"));
      }

      if (res.data.resultCode !== "OK") return ok("");
      wuid = res.data.payload.wuid;
      await this.setWuid(wuid);
    }

    if (session) {
      const status = await tinkoff_server.sessionStatus(session, this.origin);
      if (status.error !== null) {
        await JsonStore.setJson(TinkoffAuthService.START_KEY, 0); // Reset session start
      } else if (status.data.resultCode !== "OK") {
        await JsonStore.setJson(TinkoffAuthService.START_KEY, 0); // Reset session start
      }
      // Update local timing logic here if needed (millisLeft)
    }

    // Check if session is expired or empty (simplified check)
    if (!session) {
      const res = await tinkoff_server.getSession({ origin: this.origin, wuid, oldSession: session });
      if (res.error !== null) {
        return err(new AggregateError([res.error], "Failed to get session"));
      }
      if (res.data.resultCode === "OK") {
        const newSession = typeof res.data.payload === "string" ? res.data.payload : res.data.payload.sessionId;
        await this.setSession(newSession);
        return ok("updated_session");
      }
    }

    return ok("");
  }

  async loginPhone(phone: string): Promise<Result<boolean, Error>> {
    await this.setPhone(phone);
    const refreshRes = await this.refreshSession();
    if (refreshRes.error !== null) return err(refreshRes.error);

    const session = await this.getSession();
    const wuid = await this.getWuid();

    const res = await tinkoff_server.signupPost({
      origin: this.origin,
      wuid,
      session,
      phone
    });
    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to login with phone"));
    }

    if (res.data.resultCode === "WAITING_CONFIRMATION") {
      this.operationTicket = res.data.operationTicket;
      return ok(true); // Needs OTP
    }
    return ok(false);
  }

  async confirmOTP(code: string): Promise<Result<boolean, Error>> {
    const session = await this.getSession();
    const wuid = await this.getWuid();

    const res = await tinkoff_server.confirmPost({
      code,
      operationTicket: this.operationTicket,
      origin: this.origin,
      session,
      wuid
    });
    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to confirm OTP"));
    }

    if (res.data.resultCode === "OK") {
      await JsonStore.setJson(TinkoffAuthService.LOGGED_PHONE_KEY, true);
      return ok(true);
    }
    return ok(false);
  }

  async loginPassword(password: string): Promise<Result<boolean, Error>> {
    await this.setPassword(password);
    const refreshRes = await this.refreshSession();
    if (refreshRes.error !== null) return err(refreshRes.error);

    const session = await this.getSession();
    const wuid = await this.getWuid();

    const res = await tinkoff_server.signupPost({
      origin: this.origin,
      wuid,
      password,
      session
    });
    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to login with password"));
    }

    if (res.data.resultCode === "OK") {
      const levelRes = await tinkoff_server.levelUp(this.origin, session);
      if (levelRes.error !== null) return err(new AggregateError([levelRes.error], "Failed to level up"));
      return ok(true);
    }
    return ok(false);
  }

  async getOperations(): Promise<Result<TinkoffOperation[], Error>> {
    const statusRes = await this.refreshSession();
    if (statusRes.error !== null) return err(statusRes.error);

    if (statusRes.data === "updated_session") {
      const pwd = await this.getPassword();
      const pwdRes = await this.loginPassword(pwd);
      if (pwdRes.error !== null) return err(pwdRes.error);
    }

    const session = await this.getSession();
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 31);

    const res = await tinkoff_server.getOperations({ session, start, end });
    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to get operations"));
    }

    return ok(res.data.payload || []);
  }

  async signOut() {
    await JsonStore.setJson(TinkoffAuthService.PWD_KEY, "");
    await JsonStore.setJson(TinkoffAuthService.WUID_KEY, "");
    await JsonStore.setJson(TinkoffAuthService.PHONE_KEY, "");
    await JsonStore.setJson(TinkoffAuthService.SESSION_KEY, "");
    await JsonStore.setJson(TinkoffAuthService.LOGGED_PHONE_KEY, false);
  }

}
