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

  async getWuid() { return await JsonStore.getJson<string>(TinkoffAuthService.WUID_KEY) || ""; }
  async setWuid(val: string) { await JsonStore.setJson(TinkoffAuthService.WUID_KEY, val); }

  async getSession() { return await JsonStore.getJson<string>(TinkoffAuthService.SESSION_KEY) || ""; }
  async setSession(val: string) { await JsonStore.setJson(TinkoffAuthService.SESSION_KEY, val); }

  async getPhone() { return await JsonStore.getJson<string>(TinkoffAuthService.PHONE_KEY) || ""; }
  async setPhone(val: string) { await JsonStore.setJson(TinkoffAuthService.PHONE_KEY, val); }

  async getPassword() { return await JsonStore.getJson<string>(TinkoffAuthService.PWD_KEY) || ""; }
  async setPassword(val: string) { await JsonStore.setJson(TinkoffAuthService.PWD_KEY, val); }

  // --- Auth Logic ---

  /**
   * Manages session lifecycle. Mimics getSession in Dart.
   */
  async refreshSession(): Promise<string> {
    let wuid = await this.getWuid();
    const session = await this.getSession();

    if (!wuid) {
      const res = await tinkoff_server.getWebUser();
      if (res.error !== null) {
        return "" // todo обработать ошибку
      }

      if (res.data.resultCode !== "OK") return "";
      wuid = res.data.payload.wuid;
      await this.setWuid(wuid);
    }

    if (session) {
      const status = await tinkoff_server.sessionStatus(session, this.origin);
      if (status.error !== null) {
        await JsonStore.setJson(TinkoffAuthService.START_KEY, 0); // Reset session start // TODO залогировать ошибку
      }
      if (status.data.resultCode !== "OK") {
        await JsonStore.setJson(TinkoffAuthService.START_KEY, 0); // Reset session start
      }
      // Update local timing logic here if needed (millisLeft)
    }

    // Check if session is expired or empty (simplified check)
    if (!session) {
      const res = await tinkoff_server.getSession({ origin: this.origin, wuid, oldSession: session });
      if (res.error !== null) {
        return "" // todo обработать ошибку
      }
      if (res.data.resultCode === "OK") {
        const newSession = typeof res.data.payload === "string" ? res.data.payload : res.data.payload.sessionId;
        await this.setSession(newSession);
        return "updated_session";
      }
    }

    return "";
  }

  async loginPhone(phone: string): Promise<boolean> {
    await this.setPhone(phone);
    await this.refreshSession();

    const session = await this.getSession();
    const wuid = await this.getWuid();

    const res = await tinkoff_server.signupPost({
      origin: this.origin,
      wuid,
      session,
      phone
    });
    if (res.error !== null) {
      return false // todo обработать ошибку
    }

    if (res.data.resultCode === "WAITING_CONFIRMATION") {
      this.operationTicket = res.data.operationTicket;
      return true; // Needs OTP
    }
    return false;
  }

  async confirmOTP(code: string): Promise<boolean> {
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
      return false // todo обработать ошибку
    }

    if (res.data.resultCode === "OK") {
      await JsonStore.setJson(TinkoffAuthService.LOGGED_PHONE_KEY, true);
      return true;
    }
    return false;
  }

  async loginPassword(password: string): Promise<boolean> {
    await this.setPassword(password);
    await this.refreshSession();

    const session = await this.getSession();
    const wuid = await this.getWuid();

    const res = await tinkoff_server.signupPost({
      origin: this.origin,
      wuid,
      password,
      session
    });
    if (res.error !== null) {
      return false // todo обработать ошибку
    }

    if (res.data.resultCode === "OK") {
      await tinkoff_server.levelUp(this.origin, session);
      return true;
    }
    return false;
  }

  async getOperations(): Promise<TinkoffOperation[]> {
    const status = await this.refreshSession();
    if (status === "updated_session") {
      const pwd = await this.getPassword();
      await this.loginPassword(pwd);
    }

    const session = await this.getSession();
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 31);

    const res = await tinkoff_server.getOperations({ session, start, end });
    if (res.error !== null) {
      return [] // todo обработать ошибку
    }

    return res.data.payload || [];
  }

  async signOut() {
    await JsonStore.setJson(TinkoffAuthService.PWD_KEY, "");
    await JsonStore.setJson(TinkoffAuthService.WUID_KEY, "");
    await JsonStore.setJson(TinkoffAuthService.PHONE_KEY, "");
    await JsonStore.setJson(TinkoffAuthService.SESSION_KEY, "");
    await JsonStore.setJson(TinkoffAuthService.LOGGED_PHONE_KEY, false);
  }

}