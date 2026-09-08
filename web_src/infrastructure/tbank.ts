import "ts-error-as-value/lib/globals";
import { proxyFetch, ProxyResponse } from "./proxy";
import { JsonStore } from "./json_store";

// -----------------------------------------------------------------------------
// Constants matching decompiled Android app and tbank-mobile-api
// -----------------------------------------------------------------------------

export const SSO_BASE_URL = "https://id.tbank.ru/";
export const API_BASE_URL = "https://api.tbank.ru/";

export const CLIENT_ID = "tinkoff-mb-app";
export const BASIC_AUTH = "Basic dGlua29mZi1tYi1hcHA6";
export const REDIRECT_URI = "mobile://";
export const VENDOR = "tinkoff_android";
export const CLIENT_VERSION = "18.1.3-hotfix";
export const CLAIMS =
  '{"id_token":{"given_name":null, "phone_number": null, "picture": null}}';

export const APP_VERSION_NAME = "7.32.1";
export const APP_VERSION_CODE = "12278";
export const BUNDLE_ID = "com.idamob.tinkoff.android";

export const DEFAULT_DEVICE_MODEL = "Pixel 7";
export const DEFAULT_BUILD_FINGERPRINT =
  "google/panther/panther:14/UP1A.231105.003/11010452:user/release-keys";

export const TOKENS_STORAGE_KEY = "tbank_tokens";
export const IDENTITY_STORAGE_KEY = "tbank_identity";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface DeviceIdentity {
  deviceId: string;
  tinkoffDeviceId: string;
  stableId: string;
  oldDeviceId: string;
  deviceModel: string;
  buildFingerprint: string;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: string;
}

export interface TBankTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: number; // timestamp in ms
  idToken?: string;
  scope?: string;
}

export interface TBankMoney {
  value: number;
  currency: {
    code: number;
    name: string;
    strCode: string;
  };
}

export interface TBankAccount {
  id: string;
  name: string;
  accountType: string;
  moneyAmount?: TBankMoney | null;
  creditLimit?: { value: number } | null;
  hidden: boolean;
  sharedByMeFlag?: boolean;
}

// -----------------------------------------------------------------------------
// Identity Management
// -----------------------------------------------------------------------------

export function createFreshIdentity(): DeviceIdentity {
  const devId = crypto.randomUUID();
  return {
    deviceId: devId,
    tinkoffDeviceId: crypto.randomUUID(),
    stableId: crypto.randomUUID(),
    oldDeviceId: devId,
    deviceModel: DEFAULT_DEVICE_MODEL,
    buildFingerprint: DEFAULT_BUILD_FINGERPRINT,
  };
}

export async function getOrCreateIdentity(): Promise<DeviceIdentity> {
  const res = await JsonStore.getJson<DeviceIdentity>(IDENTITY_STORAGE_KEY);
  if (res.error === null && res.data && res.data.tinkoffDeviceId) {
    return res.data;
  }
  const identity = createFreshIdentity();
  await JsonStore.setJson(IDENTITY_STORAGE_KEY, identity);
  return identity;
}

export async function getStoredTokens(): Promise<TBankTokens | null> {
  const res = await JsonStore.getJson<TBankTokens>(TOKENS_STORAGE_KEY);
  if (res.error !== null || !res.data || !res.data.accessToken) {
    return null;
  }
  return res.data;
}

export async function setStoredTokens(tokens: TBankTokens | null): Promise<void> {
  if (tokens === null) {
    await JsonStore.setJson(TOKENS_STORAGE_KEY, null);
  } else {
    await JsonStore.setJson(TOKENS_STORAGE_KEY, tokens);
  }
}

// -----------------------------------------------------------------------------
// Headers and Utilities
// -----------------------------------------------------------------------------

export function buildUserAgent(identity: DeviceIdentity): string {
  return `${identity.deviceModel}/android: ${APP_VERSION_NAME}/TCSMB/${identity.buildFingerprint}`;
}

export function buildBaseHeaders(identity: DeviceIdentity): Record<string, string> {
  return {
    Accept: "application/json",
    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": buildUserAgent(identity),
    "X-Client-Info": `/android/${APP_VERSION_NAME}-${APP_VERSION_CODE}`,
  };
}

export function normalizePhone(raw: string): string {
  let cleaned = raw.trim().replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("8") && cleaned.length === 11) {
    cleaned = "+7" + cleaned.slice(1);
  } else if (cleaned.startsWith("7") && cleaned.length === 11) {
    cleaned = "+" + cleaned;
  } else if (cleaned.length === 10 && !cleaned.startsWith("+")) {
    cleaned = "+7" + cleaned;
  } else if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
}

// -----------------------------------------------------------------------------
// Cookie Jar Management
// -----------------------------------------------------------------------------

export function parseSetCookieHeaders(
  multiValueHeaders?: Record<string, string[]>
): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!multiValueHeaders) return cookies;

  for (const [k, values] of Object.entries(multiValueHeaders)) {
    if (k.toLowerCase() === "set-cookie") {
      for (const raw of values) {
        const first = raw.split(";")[0].trim();
        const eqIdx = first.indexOf("=");
        if (eqIdx !== -1) {
          const name = first.slice(0, eqIdx).trim();
          const val = first.slice(eqIdx + 1).trim();
          if (name) {
            cookies[name] = val;
          }
        }
      }
    }
  }
  return cookies;
}

export function formatCookieHeader(cookies: Record<string, string>): string | undefined {
  const entries = Object.entries(cookies);
  if (entries.length === 0) return undefined;
  return entries.map(([k, v]) => `${k}=${v}`).join("; ");
}

// -----------------------------------------------------------------------------
// PKCE (RFC 7636)
// -----------------------------------------------------------------------------

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function generatePkcePair(): Promise<PkcePair> {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const verifier = bufferToBase64Url(randomBytes);

  const hashBuf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  const challenge = bufferToBase64Url(hashBuf);

  return {
    verifier,
    challenge,
    method: "S256",
  };
}

// -----------------------------------------------------------------------------
// Anti-DDoS ssoData proof of possession & 64-field Device Fingerprint
// -----------------------------------------------------------------------------

async function sha512B64Url(str: string): Promise<string> {
  const hashBuf = await crypto.subtle.digest(
    "SHA-512",
    new TextEncoder().encode(str)
  );
  return bufferToBase64Url(hashBuf);
}

function take(s: string, n: number): string {
  if (n <= 0) return "";
  return s.slice(0, n);
}

function takeLast(s: string, n: number): string {
  if (n <= 0) return "";
  if (n >= s.length) return s;
  return s.slice(s.length - n);
}

export async function computeSsoData(
  cid: string,
  clientId: string,
  tinkoffDeviceId: string
): Promise<string> {
  const n = cid.length;
  const m = tinkoffDeviceId.length;
  const tDevHash = await sha512B64Url(tinkoffDeviceId);
  const inner =
    take(cid, Math.floor(n / 2)) +
    take(tinkoffDeviceId, Math.floor(m / 4)) +
    clientId +
    takeLast(cid, Math.floor(n / 2)) +
    takeLast(tinkoffDeviceId, Math.floor((m * 3) / 4)) +
    tDevHash;
  return await sha512B64Url(inner);
}

export function buildFingerprintPayload(
  identity: DeviceIdentity,
  ssoData: string,
  userAgent: string
): Record<string, unknown> {
  return {
    // 0–8 — app + locale + device basics
    appVersion: APP_VERSION_NAME,
    clientLanguage: "ru",
    clientTimezone: -180,
    timeZoneName: "Europe/Moscow",
    latitude: null,
    longitude: null,
    mobileDeviceModel: identity.deviceModel,
    mobileDeviceOs: "Android",
    mobileDeviceOsVersion: "14",
    // 9–11 — telephony
    mobilePhoneNumber: "",
    imei: "",
    subscriptionId: "",
    // 12–15 — screen
    screenDpi: 411,
    screenHeight: 2400,
    screenWidth: 1080,
    screenResolution: "1080x2400",
    // 16–18 — client metadata
    userAgent: userAgent,
    authType: "",
    authTypeSetDate: "",
    // 19–22 — identifiers
    mobileDeviceId: identity.deviceId,
    tDeviceId: identity.tinkoffDeviceId,
    connectionType: "wifi",
    MarketingID: "",
    // 23–27 — flags
    root_flag: false,
    emulator: 0,
    debug: 0,
    lockedDevice: 1,
    biometricsSupport: 1,
    // 28–31 — booleans
    autologinOn: false,
    autologinUsed: false,
    frontCameraAvailable: true,
    backCameraAvailable: true,
    // 32–33 — bundle + anti-DDoS proof
    bundleId: BUNDLE_ID,
    ssoData: ssoData,
    // 34–42 — SIM / locale / system
    ICCID: "",
    IMSI: "",
    serialNumber: "",
    mobileDeviceName: identity.deviceModel,
    locale: "ru_RU",
    familyNames:
      "sans-serif,sans-serif-condensed,sans-serif-light,sans-serif-medium,sans-serif-black,sans-serif-thin,sans-serif-smallcaps,serif,monospace,serif-monospace,casual,cursive",
    identifierForVendor: identity.stableId,
    systemFont: "sans-serif",
    systemFontSize: "1.0",
    // 43–52 — Build.*
    buildBoard: "panther",
    buildBootloader: "panther-1.4-10951672",
    buildBrand: "google",
    buildDevice: "panther",
    buildDisplay: "UP1A.231105.003",
    buildFingerprint: identity.buildFingerprint,
    buildHardware: "panther",
    buildID: "UP1A.231105.003",
    buildManufacturer: "Google",
    buildProduct: "panther",
    // 53–63 — tail
    buildRadio: "g5300q-231016-240218-B-11266013",
    displayMetricsDensity: "2.625",
    displayMetricsScaledDensity: "2.625",
    packageManagerGetSystemAvailableFeatures:
      "android.hardware.bluetooth,android.hardware.camera,android.hardware.camera.autofocus,android.hardware.camera.flash,android.hardware.camera.front,android.hardware.location,android.hardware.location.gps,android.hardware.location.network,android.hardware.microphone,android.hardware.nfc,android.hardware.screen.landscape,android.hardware.screen.portrait,android.hardware.sensor.accelerometer,android.hardware.sensor.gyroscope,android.hardware.sensor.proximity,android.hardware.telephony,android.hardware.touchscreen,android.hardware.touchscreen.multitouch,android.hardware.wifi,android.software.app_widgets,android.software.backup,android.software.connectionservice,android.software.device_admin,android.software.home_screen,android.software.input_methods,android.software.print,android.software.webview",
    packageManagerGetSystemSharedLibraryNames:
      "android.test.runner,android.test.mock,javax.obex,android.test.base,com.android.location.provider,android.ext.shared,com.android.nfc_extras,com.android.media.remotedisplay,com.android.future.usb.accessory",
    statFsGetTotalBytes: "120000000000",
    telephonyManagerGroupIdentifierLevel1: "",
    isVpnConnected: false,
    deviceOs: "Android",
    advertisingID: identity.stableId,
    contacts: 0,
  };
}

// -----------------------------------------------------------------------------
// Interactive Auth Session
// -----------------------------------------------------------------------------

export interface TBankAuthStepResult {
  step: "otp" | "totp" | "password" | "complete" | "unknown";
  cid: string;
  action: string;
  token?: string;
  otpLength?: number;
  phoneMasked?: string;
  userName?: string;
  code?: string;
  raw?: Record<string, unknown>;
}

export class TBankAuthSession {
  identity: DeviceIdentity | null = null;
  pkce: PkcePair | null = null;
  cookies: Record<string, string> = {};
  cid: string = "";
  action: string = "step";
  token: string | null = null;
  otpLength: number = 6;
  phoneMasked: string | null = null;
  userName: string | null = null;

  async init(): Promise<void> {
    this.identity = await getOrCreateIdentity();
    this.pkce = await generatePkcePair();
    this.cookies = {};
    this.cid = "";
    this.action = "step";
    this.token = null;
  }

  private updateCookies(headers?: Record<string, string[]>): void {
    const newCookies = parseSetCookieHeaders(headers);
    this.cookies = { ...this.cookies, ...newCookies };
  }

  private parseStepResponse(data: Record<string, unknown>): TBankAuthStepResult {
    if (data.code) {
      return {
        step: "complete",
        cid: this.cid,
        action: this.action,
        code: String(data.code),
        raw: data,
      };
    }

    const stepName = String(data.step || "");
    const action = String(data.action || "step");
    const cid = String(data.cid || this.cid);
    this.cid = cid;
    this.action = action;

    if (data.token) {
      this.token = String(data.token);
    }

    if (stepName === "totp") {
      return {
        step: "totp",
        cid,
        action,
        raw: data,
      };
    }

    if (stepName === "otp") {
      const lengthRaw = data.length;
      const length = typeof lengthRaw === "number" ? lengthRaw : 6;
      this.otpLength = length;
      this.phoneMasked = typeof data.phone === "string" ? data.phone : null;
      return {
        step: "otp",
        cid,
        action,
        token: this.token || undefined,
        otpLength: length,
        phoneMasked: this.phoneMasked || undefined,
        raw: data,
      };
    }

    if (stepName === "password") {
      this.userName = typeof data.name === "string" ? data.name : null;
      return {
        step: "password",
        cid,
        action,
        userName: this.userName || undefined,
        raw: data,
      };
    }

    return {
      step: "unknown",
      cid,
      action,
      raw: data,
    };
  }

  /**
   * Starts authorization flow: POST /auth/authorize
   */
  async beginAuthorize(): Promise<Result<void, Error>> {
    if (!this.identity || !this.pkce) {
      await this.init();
    }
    const identity = this.identity!;
    const pkce = this.pkce!;

    const form: Record<string, string> = {
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      response_mode: "json",
      display: "json",
      device_id: identity.tinkoffDeviceId,
      client_version: CLIENT_VERSION,
      vendor: VENDOR,
      claims: CLAIMS,
      code_challenge: pkce.challenge,
      code_challenge_method: pkce.method,
    };

    const headers: Record<string, string> = {
      ...buildBaseHeaders(identity),
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const res = await proxyFetch(SSO_BASE_URL + "auth/authorize", {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    });

    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to start authorize"));
    }

    this.updateCookies(res.data.multiValueHeaders);

    const jsonRes = await res.data.json<Record<string, unknown>>();
    if (jsonRes.error !== null) {
      return err(new AggregateError([jsonRes.error], "Failed to parse authorize response"));
    }

    const data = jsonRes.data;
    this.parseStepResponse(data);
    return ok(undefined);
  }

  /**
   * Submits phone number: POST /auth/<action>?cid=<cid> with fingerprint
   */
  async submitPhone(phone: string): Promise<Result<TBankAuthStepResult, Error>> {
    if (!this.cid) {
      const authRes = await this.beginAuthorize();
      if (authRes.error !== null) return err(authRes.error);
    }

    const identity = this.identity!;
    const normalized = normalizePhone(phone);
    const userAgent = buildUserAgent(identity);
    const ssoData = await computeSsoData(this.cid, CLIENT_ID, identity.tinkoffDeviceId);
    const payload = buildFingerprintPayload(identity, ssoData, userAgent);
    const fingerprintJson = JSON.stringify(payload);

    const form: Record<string, string> = {
      step: "phone",
      phone: normalized,
      fingerprint: fingerprintJson,
    };

    const cookieHeader = formatCookieHeader(this.cookies);
    const headers: Record<string, string> = {
      ...buildBaseHeaders(identity),
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const url = `${SSO_BASE_URL}auth/${encodeURIComponent(this.action)}?cid=${encodeURIComponent(this.cid)}`;
    const res = await proxyFetch(url, {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    });

    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to submit phone"));
    }

    this.updateCookies(res.data.multiValueHeaders);

    const jsonRes = await res.data.json<Record<string, unknown>>();
    if (jsonRes.error !== null) {
      return err(new AggregateError([jsonRes.error], "Failed to parse phone response"));
    }

    let data = jsonRes.data;
    if (data.errorMessage || data.error_description || data.error) {
      const msg = String(data.errorMessage || data.error_description || data.error);
      return err(new Error(msg));
    }

    // Check if selfie step is requested; automatically skip it if permitted
    if (data.step === "selfie") {
      const skipRes = await this.skipSelfie();
      if (skipRes.error !== null) return err(skipRes.error);
      data = skipRes.data;
    }

    return ok(this.parseStepResponse(data));
  }

  /**
   * Submits 6-digit TOTP code: POST /auth/<action>?cid=<cid>
   */
  async submitTotp(code: string): Promise<Result<TBankAuthStepResult, Error>> {
    const identity = this.identity!;
    const form: Record<string, string> = {
      step: "totp",
      totpCode: code.trim(),
    };

    const cookieHeader = formatCookieHeader(this.cookies);
    const headers: Record<string, string> = {
      ...buildBaseHeaders(identity),
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const url = `${SSO_BASE_URL}auth/${encodeURIComponent(this.action)}?cid=${encodeURIComponent(this.cid)}`;
    const res = await proxyFetch(url, {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    });

    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to submit TOTP code"));
    }

    this.updateCookies(res.data.multiValueHeaders);

    const jsonRes = await res.data.json<Record<string, unknown>>();
    if (jsonRes.error !== null) {
      return err(new AggregateError([jsonRes.error], "Failed to parse TOTP response"));
    }

    let data = jsonRes.data;
    if (data.errorMessage || data.error_message || data.error_description) {
      const msg = String(data.errorMessage || data.error_message || data.error_description);
      return err(new Error(msg));
    }
    if (data.error && !data.code && !data.step) {
      return err(new Error(String(data.error)));
    }

    // Check if selfie step is requested; automatically skip it if permitted
    if (data.step === "selfie") {
      const skipRes = await this.skipSelfie();
      if (skipRes.error !== null) return err(skipRes.error);
      data = skipRes.data;
    }

    return ok(this.parseStepResponse(data));
  }

  /**
   * Skips TOTP step with skipped=true to fall back to SMS OTP
   */
  async skipTotp(): Promise<Result<TBankAuthStepResult, Error>> {
    const identity = this.identity!;
    const form: Record<string, string> = {
      step: "totp",
      skipped: "true",
    };

    const cookieHeader = formatCookieHeader(this.cookies);
    const headers: Record<string, string> = {
      ...buildBaseHeaders(identity),
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const url = `${SSO_BASE_URL}auth/${encodeURIComponent(this.action)}?cid=${encodeURIComponent(this.cid)}`;
    const res = await proxyFetch(url, {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    });

    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to skip totp"));
    }

    this.updateCookies(res.data.multiValueHeaders);

    const jsonRes = await res.data.json<Record<string, unknown>>();
    if (jsonRes.error !== null) {
      return err(new AggregateError([jsonRes.error], "Failed to parse totp response"));
    }

    let data = jsonRes.data;
    if (data.errorMessage || data.error_message || data.error_description) {
      const msg = String(data.errorMessage || data.error_message || data.error_description);
      return err(new Error(msg));
    }

    // Check if selfie step is requested; automatically skip it if permitted
    if (data.step === "selfie") {
      const skipRes = await this.skipSelfie();
      if (skipRes.error !== null) return err(skipRes.error);
      data = skipRes.data;
    }

    return ok(this.parseStepResponse(data));
  }

  /**
   * Submits OTP code: POST /auth/<action>?cid=<cid>
   * Automatically handles and skips selfie step if server returns it.
   */
  async submitOtp(code: string): Promise<Result<TBankAuthStepResult, Error>> {
    const identity = this.identity!;
    const form: Record<string, string> = {
      step: "otp",
      otp: code.trim(),
    };
    if (this.token) {
      form.token = this.token;
    }

    const cookieHeader = formatCookieHeader(this.cookies);
    const headers: Record<string, string> = {
      ...buildBaseHeaders(identity),
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const url = `${SSO_BASE_URL}auth/${encodeURIComponent(this.action)}?cid=${encodeURIComponent(this.cid)}`;
    const res = await proxyFetch(url, {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    });

    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to submit OTP"));
    }

    this.updateCookies(res.data.multiValueHeaders);

    const jsonRes = await res.data.json<Record<string, unknown>>();
    if (jsonRes.error !== null) {
      return err(new AggregateError([jsonRes.error], "Failed to parse OTP response"));
    }

    let data = jsonRes.data;
    if (data.errorMessage || data.error_description || data.error) {
      const msg = String(data.errorMessage || data.error_description || data.error);
      return err(new Error(msg));
    }

    // Check if selfie step is requested; automatically skip it if permitted
    if (data.step === "selfie") {
      const skipRes = await this.skipSelfie();
      if (skipRes.error !== null) return err(skipRes.error);
      data = skipRes.data;
    }

    return ok(this.parseStepResponse(data));
  }

  /**
   * Skips selfie step with camera_unavailable
   */
  private async skipSelfie(): Promise<Result<Record<string, unknown>, Error>> {
    const identity = this.identity!;
    const form: Record<string, string> = {
      step: "selfie",
      skipped: "camera_unavailable",
    };

    const cookieHeader = formatCookieHeader(this.cookies);
    const headers: Record<string, string> = {
      ...buildBaseHeaders(identity),
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const url = `${SSO_BASE_URL}auth/${encodeURIComponent(this.action)}?cid=${encodeURIComponent(this.cid)}`;
    const res = await proxyFetch(url, {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    });

    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to skip selfie"));
    }

    this.updateCookies(res.data.multiValueHeaders);

    const jsonRes = await res.data.json<Record<string, unknown>>();
    if (jsonRes.error !== null) {
      return err(new AggregateError([jsonRes.error], "Failed to parse selfie response"));
    }

    return ok(jsonRes.data);
  }

  /**
   * Submits password: POST /auth/<action>?cid=<cid>
   */
  async submitPassword(password: string): Promise<Result<TBankAuthStepResult, Error>> {
    const identity = this.identity!;
    const form: Record<string, string> = {
      step: "password",
      password: password,
    };

    const cookieHeader = formatCookieHeader(this.cookies);
    const headers: Record<string, string> = {
      ...buildBaseHeaders(identity),
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const url = `${SSO_BASE_URL}auth/${encodeURIComponent(this.action)}?cid=${encodeURIComponent(this.cid)}`;
    const res = await proxyFetch(url, {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    });

    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to submit password"));
    }

    this.updateCookies(res.data.multiValueHeaders);

    const jsonRes = await res.data.json<Record<string, unknown>>();
    if (jsonRes.error !== null) {
      return err(new AggregateError([jsonRes.error], "Failed to parse password response"));
    }

    let data = jsonRes.data;
    if (data.errorMessage || data.error_description || data.error) {
      const msg = String(data.errorMessage || data.error_description || data.error);
      return err(new Error(msg));
    }

    // Check if selfie step is requested; automatically skip it if permitted
    if (data.step === "selfie") {
      const skipRes = await this.skipSelfie();
      if (skipRes.error !== null) return err(skipRes.error);
      data = skipRes.data;
    }

    return ok(this.parseStepResponse(data));
  }

  /**
   * Exchanges OAuth authorization code for tokens: POST /auth/token
   */
  async exchangeCode(code: string): Promise<Result<TBankTokens, Error>> {
    if (!this.pkce || !this.identity) {
      return err(new Error("Missing PKCE or identity for code exchange"));
    }

    const identity = this.identity;
    const pkce = this.pkce;

    const cookieHeader = formatCookieHeader(this.cookies);
    const headers: Record<string, string> = {
      ...buildBaseHeaders(identity),
      "Content-Type": "application/x-www-form-urlencoded",
      "X-SSO-No-Adapter": "true",
      Authorization: BASIC_AUTH,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const form: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_version: CLIENT_VERSION,
      vendor: VENDOR,
      code_verifier: pkce.verifier,
    };

    const res = await proxyFetch(SSO_BASE_URL + "auth/token", {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    });

    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to exchange authorization code"));
    }

    const jsonRes = await res.data.json<Record<string, unknown>>();
    if (jsonRes.error !== null) {
      return err(new AggregateError([jsonRes.error], "Failed to parse token exchange response"));
    }

    const data = jsonRes.data;
    if (!data.access_token) {
      const msg = String(data.errorMessage || data.error_description || "Missing access_token in token exchange");
      return err(new Error(msg));
    }

    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 7200;
    const tokens: TBankTokens = {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token || ""),
      tokenType: String(data.token_type || "Bearer"),
      expiresAt: Date.now() + expiresIn * 1000,
      idToken: typeof data.id_token === "string" ? data.id_token : undefined,
      scope: typeof data.scope === "string" ? data.scope : undefined,
    };

    await setStoredTokens(tokens);
    return ok(tokens);
  }
}

// -----------------------------------------------------------------------------
// Token Refresh & Business API
// -----------------------------------------------------------------------------

export async function refreshTBankTokens(
  identity: DeviceIdentity,
  refreshToken: string
): Promise<Result<TBankTokens, Error>> {
  const headers: Record<string, string> = {
    ...buildBaseHeaders(identity),
    "Content-Type": "application/x-www-form-urlencoded",
    "X-SSO-No-Adapter": "true",
    Authorization: BASIC_AUTH,
    "x-content-id": identity.stableId,
  };

  const form: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    device_id: identity.tinkoffDeviceId,
    old_device_id: identity.oldDeviceId || identity.deviceId,
    fingerprint: identity.stableId,
    client_version: CLIENT_VERSION,
    vendor: VENDOR,
  };

  const res = await proxyFetch(SSO_BASE_URL + "auth/token", {
    method: "POST",
    headers,
    body: new URLSearchParams(form).toString(),
  });

  if (res.error !== null) {
    return err(new AggregateError([res.error], "Failed to refresh token"));
  }

  const jsonRes = await res.data.json<Record<string, unknown>>();
  if (jsonRes.error !== null) {
    return err(new AggregateError([jsonRes.error], "Failed to parse refresh token response"));
  }

  const data = jsonRes.data;
  if (!data.access_token) {
    const msg = String(data.errorMessage || data.error_description || "Refresh failed: missing access_token");
    return err(new Error(msg));
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 7200;
  const tokens: TBankTokens = {
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token || refreshToken),
    tokenType: String(data.token_type || "Bearer"),
    expiresAt: Date.now() + expiresIn * 1000,
    idToken: typeof data.id_token === "string" ? data.id_token : undefined,
    scope: typeof data.scope === "string" ? data.scope : undefined,
  };

  await setStoredTokens(tokens);
  return ok(tokens);
}

/**
 * Fetches accounts list from GET /v1/accounts_light, automatically refreshing tokens if needed.
 */
export async function getTBankAccounts(): Promise<Result<TBankAccount[], Error>> {
  const identity = await getOrCreateIdentity();
  let tokens = await getStoredTokens();
  if (!tokens) {
    return err(new Error("Not authenticated in T-Bank"));
  }

  // Proactive refresh if token expires in less than 60 seconds
  if (tokens.expiresAt - Date.now() < 60_000) {
    const refRes = await refreshTBankTokens(identity, tokens.refreshToken);
    if (refRes.error === null) {
      tokens = refRes.data;
    }
  }

  const doFetch = async (
    toks: TBankTokens
  ): Promise<Result<ProxyResponse, Error>> => {
    const headers: Record<string, string> = {
      ...buildBaseHeaders(identity),
      "X-MB-Authorized": "true",
      Authorization: `${toks.tokenType} ${toks.accessToken}`,
    };
    return await proxyFetch(API_BASE_URL + "v1/accounts_light?withDigitalRub=false", {
      method: "GET",
      headers,
    });
  };

  let res = await doFetch(tokens);
  if (res.error !== null) {
    return err(new AggregateError([res.error], "Failed to fetch accounts"));
  }

  // If 401 Unauthorized, attempt refresh once
  if (res.data.status === 401) {
    const refRes = await refreshTBankTokens(identity, tokens.refreshToken);
    if (refRes.error !== null) {
      return err(new AggregateError([refRes.error], "Unauthorized and failed to refresh token"));
    }
    tokens = refRes.data;
    res = await doFetch(tokens);
    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to fetch accounts after token refresh"));
    }
  }

  const jsonRes = await res.data.json<Record<string, unknown>>();
  if (jsonRes.error !== null) {
    return err(new AggregateError([jsonRes.error], "Failed to parse accounts response"));
  }

  const data = jsonRes.data;
  if (data.resultCode !== "OK") {
    return err(new Error(`T-Bank API error: ${data.resultCode} - ${data.errorMessage || ""}`));
  }

  const payload = Array.isArray(data.payload) ? (data.payload as TBankAccount[]) : [];
  return ok(payload);
}
