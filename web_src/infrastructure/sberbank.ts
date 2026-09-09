import "ts-error-as-value/lib/globals";
import { proxyFetch } from "./proxy";
import { JsonStore } from "./json_store";

// -----------------------------------------------------------------------------
// Constants matching reverse-engineered Sberbank Android client
// -----------------------------------------------------------------------------

export const SBER_BASE_URL = "https://online.sberbank.ru:4477/";
export const SBER_DEFAULT_PIN = "42424";

export const SBER_IDENTITY_STORAGE_KEY = "sber_identity";
export const SBER_SESSION_STORAGE_KEY = "sber_session";

export const SBER_DEFAULT_COOKIES: Record<string, string> = {
  JSESSIONID: "0000uHrFvcD0Xv3qIYW5bXDS_Jy:1akk7tu3m|rsDPJSESSIONID=PBC5YS:-152294547",
  SWJSESSIONID: "8f0961c07d8ff7ca1a881002df39ec2f",
};

const SBER_MOBILE_SDK_DATA =
  '{"TIMESTAMP":"2019-09-13T07:23:14Z","HardwareID":"-1","SIM_ID":"-1","PhoneNumber":"-1","GeoLocationInfo":[{"Timestamp":"0","Status":"1"}],"DeviceModel":"ANE-LX1","MultitaskingSupported":true,"DeviceName":"marky","DeviceSystemName":"Android","DeviceSystemVersion":"28","Languages":"ru","WiFiMacAddress":"02:00:00:00:00:00","WiFiNetworksData":{"BBSID":"02:00:00:00:00:00","SignalStrength":"-47","Channel":"null"},"CellTowerId":"-1","LocationAreaCode":"-1","ScreenSize":"1080x2060","RSA_ApplicationKey":"2C501591EA5BF79F1C0ABA8B628C2571","MCC":"286","MNC":"02","OS_ID":"1f32651b72df5515","SDK_VERSION":"3.10.0","Compromised":0,"Emulator":0}';

const SBER_MOBILE_SDK_KAV =
  '{"osVersion":0,"KavSdkId":"","KavSdkVersion":"","KavSdkVirusDBVersion":"SdkVirusDbInfo(year=0, month=0, day=0, hour=0, minute=0, second=0, knownThreatsCount=0, records=0, size=0)","KavSdkVirusDBStatus":"","KavSdkVirusDBStatusDate":"","KavSdkRoot":false,"LowPasswordQuality":false,"NonMarketAppsAllowed":false,"UsbDebugOn":false,"ScanStatus":"NONE"}';

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export interface SberIdentity {
  devId: string;
  devIdOld: string;
  deviceName: string;
  appVersion: string;
  version: string;
}

export interface SberSession {
  mGuid: string;
  pin: string;
  login: string;
  sessionCookie?: string;
  sessionExpiresAt?: number;
  cookies?: Record<string, string>;
}

export interface SberProduct {
  id: string;
  name: string;
  type: "card" | "account" | "loan" | "other";
  number?: string;
  cardAccount?: string;
  balance: number;
  currencyCode: string;
  currencyName: string;
  state?: string;
  isBlocked?: boolean;
}

// -----------------------------------------------------------------------------
// Identity & Session Management
// -----------------------------------------------------------------------------

export function generateRandomHex(length: number = 40): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

export function createFreshSberIdentity(): SberIdentity {
  const devId = generateRandomHex(40);
  return {
    devId,
    devIdOld: devId,
    deviceName: "HUAWEI_ANE-LX1",
    appVersion: "10.2.0",
    version: "9.20",
  };
}

export async function getOrCreateSberIdentity(): Promise<SberIdentity> {
  const res = await JsonStore.getJson<SberIdentity>(SBER_IDENTITY_STORAGE_KEY);
  if (res.error === null && res.data && res.data.devId) {
    return res.data;
  }
  const identity = createFreshSberIdentity();
  await JsonStore.setJson(SBER_IDENTITY_STORAGE_KEY, identity);
  return identity;
}

export async function getStoredSberSession(): Promise<SberSession | null> {
  const res = await JsonStore.getJson<SberSession>(SBER_SESSION_STORAGE_KEY);
  if (res.error !== null || !res.data || !res.data.mGuid) {
    return null;
  }
  return res.data;
}

export async function setStoredSberSession(session: SberSession | null): Promise<void> {
  if (session === null) {
    await JsonStore.setJson(SBER_SESSION_STORAGE_KEY, null);
  } else {
    await JsonStore.setJson(SBER_SESSION_STORAGE_KEY, session);
  }
}

// -----------------------------------------------------------------------------
// Utilities & Cookie Jar
// -----------------------------------------------------------------------------

export function normalizeSberLogin(raw: string): string {
  const trimmed = raw.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");

  // If it's a 16-19 digit card number
  if (digitsOnly.length >= 16 && digitsOnly.length <= 19) {
    return digitsOnly;
  }

  // Russian phone formats
  if (digitsOnly.length === 10) {
    return "7" + digitsOnly;
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith("8")) {
    return "7" + digitsOnly.slice(1);
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith("7")) {
    return digitsOnly;
  }

  return trimmed;
}

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

export function parseXml(xml: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(xml, "text/xml");
}

export function getFirstTagText(el: Document | Element, tagName: string): string | null {
  const elements = el.getElementsByTagName(tagName);
  if (elements.length === 0) return null;
  return elements[0].textContent?.trim() || null;
}

export function extractErrorMessage(doc: Document): string {
  const errors = doc.getElementsByTagName("error");
  if (errors.length > 0) {
    const textEl = errors[0].getElementsByTagName("text")[0] || errors[0];
    const text = textEl.textContent?.trim();
    if (text && !text.includes("\ufffd") && text.length > 0) {
      return text;
    }
  }

  const desc = getFirstTagText(doc, "description");
  if (desc && !desc.includes("\ufffd") && desc.length > 0) {
    return desc;
  }

  const code = getFirstTagText(doc, "code");
  const attempts = getFirstTagText(doc, "attemptsRemain");

  if (code === "1") {
    return attempts
      ? `Неверный код подтверждения. Осталось попыток: ${attempts}.`
      : "Неверный код подтверждения из СМС.";
  }
  if (code === "2") {
    return "Ошибка выполнения операции на стороне банка.";
  }
  if (code === "7") {
    return "Регистрация устройства не подтверждена.";
  }
  return code ? `Ошибка банка (код ${code})` : "Произошла ошибка при обращении к банку";
}

export function parseSberProductsXml(xml: string): SberProduct[] {
  const doc = parseXml(xml);
  const products: SberProduct[] = [];

  // Parse Cards
  const cardsContainer = doc.getElementsByTagName("cards")[0];
  if (cardsContainer) {
    const cardElements = cardsContainer.getElementsByTagName("card");
    for (let i = 0; i < cardElements.length; i++) {
      const el = cardElements[i];
      const id = getFirstTagText(el, "id") || `card-${i}`;
      const name = getFirstTagText(el, "name") || "Карта СберБанка";
      const number = getFirstTagText(el, "number") || undefined;
      const cardAccount = getFirstTagText(el, "cardAccount") || undefined;
      const state = getFirstTagText(el, "state") || "active";
      const isBlocked = state.toLowerCase() === "blocked";

      const limitAmountStr =
        getFirstTagText(el, "availableLimit") ||
        getFirstTagText(el, "amount") ||
        "0";
      const cleanNum = limitAmountStr.replace(/\s/g, "").replace(",", ".");
      const match = cleanNum.match(/-?\d+(\.\d+)?/);
      const balance = match ? parseFloat(match[0]) : 0;

      const currencyEl = el.getElementsByTagName("currency")[0];
      const currencyCode = currencyEl ? getFirstTagText(currencyEl, "code") || "RUB" : "RUB";
      const currencyName = currencyEl ? getFirstTagText(currencyEl, "name") || "₽" : "₽";

      products.push({
        id,
        name,
        type: "card",
        number,
        cardAccount,
        balance,
        currencyCode,
        currencyName,
        state,
        isBlocked,
      });
    }
  }

  // Parse Accounts
  const accountsContainer = doc.getElementsByTagName("accounts")[0];
  if (accountsContainer) {
    const accountElements = accountsContainer.getElementsByTagName("account");
    for (let i = 0; i < accountElements.length; i++) {
      const el = accountElements[i];
      const id = getFirstTagText(el, "id") || `acc-${i}`;
      const name = getFirstTagText(el, "name") || "Счет СберБанка";
      const number = getFirstTagText(el, "number") || undefined;
      const state = getFirstTagText(el, "state") || "active";
      const isBlocked = state.toLowerCase() === "blocked" || state.toLowerCase() === "closed";

      const balanceContainer = el.getElementsByTagName("balance")[0];
      const availcashContainer = el.getElementsByTagName("availcash")[0];
      const targetContainer = balanceContainer || availcashContainer;

      const balanceAmountStr = targetContainer
        ? getFirstTagText(targetContainer, "amount") || "0"
        : getFirstTagText(el, "amount") || "0";

      const cleanNum = balanceAmountStr.replace(/\s/g, "").replace(",", ".");
      const match = cleanNum.match(/-?\d+(\.\d+)?/);
      const balance = match ? parseFloat(match[0]) : 0;

      const currencyEl = targetContainer ? targetContainer.getElementsByTagName("currency")[0] : null;
      const currencyCode = currencyEl ? getFirstTagText(currencyEl, "code") || "RUB" : "RUB";
      const currencyName = currencyEl ? getFirstTagText(currencyEl, "name") || "₽" : "₽";

      products.push({
        id,
        name,
        type: "account",
        number,
        balance,
        currencyCode,
        currencyName,
        state,
        isBlocked,
      });
    }
  }

  // Parse Loans
  const loansContainer = doc.getElementsByTagName("loans")[0];
  if (loansContainer) {
    const loanElements = loansContainer.getElementsByTagName("loan");
    for (let i = 0; i < loanElements.length; i++) {
      const el = loanElements[i];
      const id = getFirstTagText(el, "id") || `loan-${i}`;
      const name = getFirstTagText(el, "name") || "Кредит СберБанка";
      const number = getFirstTagText(el, "number") || undefined;

      const balanceContainer = el.getElementsByTagName("balance")[0];
      const loanAmountStr = balanceContainer
        ? getFirstTagText(balanceContainer, "amount") || "0"
        : getFirstTagText(el, "amount") || "0";

      const cleanNum = loanAmountStr.replace(/\s/g, "").replace(",", ".");
      const match = cleanNum.match(/-?\d+(\.\d+)?/);
      const balance = match ? parseFloat(match[0]) : 0;

      const currencyEl = el.getElementsByTagName("currency")[0];
      const currencyCode = currencyEl ? getFirstTagText(currencyEl, "code") || "RUB" : "RUB";
      const currencyName = currencyEl ? getFirstTagText(currencyEl, "name") || "₽" : "₽";

      products.push({
        id,
        name,
        type: "loan",
        number,
        balance,
        currencyCode,
        currencyName,
        state: "active",
        isBlocked: false,
      });
    }
  }

  return products;
}

// -----------------------------------------------------------------------------
// Sberbank Auth Session
// -----------------------------------------------------------------------------

export interface SberRegisterStepResult {
  mGuid: string;
  attemptsRemain?: number;
}

export class SberbankAuthSession {
  identity: SberIdentity | null = null;
  cookies: Record<string, string> = { ...SBER_DEFAULT_COOKIES };
  mGuid: string | null = null;
  loginInput: string | null = null;
  pin: string = SBER_DEFAULT_PIN;
  attemptsRemain: number | null = null;

  async init(): Promise<void> {
    this.identity = await getOrCreateSberIdentity();
    this.cookies = { ...SBER_DEFAULT_COOKIES };
    this.mGuid = null;
    this.loginInput = null;
    this.attemptsRemain = null;
  }

  private updateCookies(headers?: Record<string, string[]>): void {
    const newCookies = parseSetCookieHeaders(headers);
    this.cookies = { ...this.cookies, ...newCookies };
  }

  /**
   * Step 1: Initiates device registration by sending login/phone/card
   * POST /CSAMAPI/registerApp.do with operation=register
   */
  async register(loginRaw: string): Promise<Result<SberRegisterStepResult, Error>> {
    if (!this.identity) {
      await this.init();
    }
    const identity = this.identity!;
    const login = normalizeSberLogin(loginRaw);
    this.loginInput = login;

    const form: Record<string, string> = {
      operation: "register",
      login,
      version: identity.version,
      appType: "android",
      appVersion: identity.appVersion,
      deviceName: identity.deviceName,
      devID: identity.devId,
      devIDOld: identity.devIdOld,
      mobileSdkData: SBER_MOBILE_SDK_DATA,
      mobileSDKKAV: SBER_MOBILE_SDK_KAV,
    };

    const cookieHeader = formatCookieHeader(this.cookies);
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const url = SBER_BASE_URL + "CSAMAPI/registerApp.do";
    const res = await proxyFetch(url, {
      method: "POST",
      headers,
      body: new URLSearchParams(form).toString(),
    });

    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to initiate Sberbank registration"));
    }

    this.updateCookies(res.data.multiValueHeaders);

    const bodyText = res.data.body || "";
    const doc = parseXml(bodyText);
    const code = getFirstTagText(doc, "code");

    if (code !== "0") {
      const errMsg = extractErrorMessage(doc);
      return err(new Error(errMsg));
    }

    const mGuid = getFirstTagText(doc, "mGUID");
    if (!mGuid) {
      return err(new Error("Не удалось получить mGUID из ответа банка"));
    }

    this.mGuid = mGuid;
    const attemptsStr = getFirstTagText(doc, "attemptsRemain");
    if (attemptsStr) {
      const parsed = parseInt(attemptsStr, 10);
      if (!isNaN(parsed)) {
        this.attemptsRemain = parsed;
      }
    }

    return ok({
      mGuid,
      attemptsRemain: this.attemptsRemain ?? undefined,
    });
  }

  /**
   * Step 2: Confirms SMS password and sets PIN
   * POST /CSAMAPI/registerApp.do with operation=confirm, then operation=createPIN
   */
  async confirm(smsPassword: string, pin: string = SBER_DEFAULT_PIN): Promise<Result<void, Error>> {
    if (!this.identity || !this.mGuid) {
      return err(new Error("Сессия регистрации не инициализирована"));
    }

    const identity = this.identity;
    const mGuid = this.mGuid;
    this.pin = pin;

    // 1. Confirm SMS code
    const confirmForm: Record<string, string> = {
      operation: "confirm",
      mGUID: mGuid,
      smsPassword: smsPassword.trim(),
      version: identity.version,
      appType: "android",
      mobileSdkData: SBER_MOBILE_SDK_DATA,
      mobileSDKKAV: SBER_MOBILE_SDK_KAV,
      confirmData: smsPassword.trim(),
      confirmOperation: "confirmSMS",
    };

    let cookieHeader = formatCookieHeader(this.cookies);
    let headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const confirmRes = await proxyFetch(SBER_BASE_URL + "CSAMAPI/registerApp.do", {
      method: "POST",
      headers,
      body: new URLSearchParams(confirmForm).toString(),
    });

    if (confirmRes.error !== null) {
      return err(new AggregateError([confirmRes.error], "Failed to submit SMS confirmation"));
    }

    this.updateCookies(confirmRes.data.multiValueHeaders);

    const doc = parseXml(confirmRes.data.body || "");
    const code = getFirstTagText(doc, "code");

    if (code !== "0") {
      const attemptsStr = getFirstTagText(doc, "attemptsRemain");
      if (attemptsStr) {
        const parsed = parseInt(attemptsStr, 10);
        if (!isNaN(parsed)) {
          this.attemptsRemain = parsed;
        }
      }
      const errMsg = extractErrorMessage(doc);
      return err(new Error(errMsg));
    }

    // 2. Create PIN
    const pinForm: Record<string, string> = {
      operation: "createPIN",
      mGUID: mGuid,
      password: pin,
      version: identity.version,
      appType: "android",
      appVersion: identity.appVersion,
      deviceName: identity.deviceName,
      devID: identity.devId,
      devIDOld: identity.devIdOld,
      mobileSdkData: SBER_MOBILE_SDK_DATA,
      mobileSDKKAV: SBER_MOBILE_SDK_KAV,
    };

    cookieHeader = formatCookieHeader(this.cookies);
    headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const pinRes = await proxyFetch(SBER_BASE_URL + "CSAMAPI/registerApp.do", {
      method: "POST",
      headers,
      body: new URLSearchParams(pinForm).toString(),
    });

    if (pinRes.error !== null) {
      return err(new AggregateError([pinRes.error], "Failed to create PIN"));
    }

    this.updateCookies(pinRes.data.multiValueHeaders);

    const pinDoc = parseXml(pinRes.data.body || "");
    const pinCode = getFirstTagText(pinDoc, "code");
    if (pinCode !== "0") {
      const errMsg = extractErrorMessage(pinDoc);
      return err(new Error(errMsg));
    }

    // Registration fully successful! Save session
    const session: SberSession = {
      mGuid,
      pin,
      login: this.loginInput || "",
      cookies: this.cookies,
    };
    await setStoredSberSession(session);

    return ok(undefined);
  }

  /**
   * Logs into Sberbank using mGUID and PIN to obtain a fresh session cookie
   * POST /CSAMAPI/login.do -> POST /mobile9/postCSALogin.do
   */
  async login(mGuid: string, pin: string = SBER_DEFAULT_PIN): Promise<Result<string, Error>> {
    if (!this.identity) {
      await this.init();
    }
    const identity = this.identity!;

    const loginForm: Record<string, string> = {
      operation: "button.login",
      password: pin,
      version: identity.version,
      appType: "android",
      appVersion: identity.appVersion,
      osVersion: "28.0",
      deviceName: identity.deviceName,
      isLightScheme: "false",
      isSafe: "true",
      mGUID: mGuid,
      devID: identity.devId,
      mobileSdkData: SBER_MOBILE_SDK_DATA,
      mobileSDKKAV: SBER_MOBILE_SDK_KAV,
    };

    const cookieHeader = formatCookieHeader(this.cookies);
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const loginRes = await proxyFetch(SBER_BASE_URL + "CSAMAPI/login.do", {
      method: "POST",
      headers,
      body: new URLSearchParams(loginForm).toString(),
    });

    if (loginRes.error !== null) {
      return err(new AggregateError([loginRes.error], "Failed to authenticate with Sberbank"));
    }

    this.updateCookies(loginRes.data.multiValueHeaders);

    const doc = parseXml(loginRes.data.body || "");
    const code = getFirstTagText(doc, "code");

    if (code !== "0") {
      const errMsg = extractErrorMessage(doc);
      return err(new Error(errMsg));
    }

    const token = getFirstTagText(doc, "token");
    if (!token) {
      return err(new Error("Не удалось получить авторизационный токен Sberbank"));
    }

    // Exchange token via postCSALogin.do
    const csaForm: Record<string, string> = {
      token,
      appName: "Сбербанк",
      appBuildOSType: "android",
      appVersion: identity.appVersion,
      appBuildType: "RELEASE",
      appFormat: "STANDALONE",
      deviceName: identity.deviceName,
      deviceType: "ANE-LX1",
      deviceOSType: "android",
      deviceOSVersion: "9",
    };

    const csaCookieHeader = formatCookieHeader(this.cookies);
    const csaHeaders: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(csaCookieHeader ? { Cookie: csaCookieHeader } : {}),
    };

    const csaRes = await proxyFetch(SBER_BASE_URL + "mobile9/postCSALogin.do", {
      method: "POST",
      headers: csaHeaders,
      body: new URLSearchParams(csaForm).toString(),
    });

    if (csaRes.error !== null) {
      return err(new AggregateError([csaRes.error], "Failed to complete CSA login"));
    }

    this.updateCookies(csaRes.data.multiValueHeaders);

    const sessionCookie = this.cookies["JSESSIONID"];
    if (!sessionCookie) {
      return err(new Error("Ответ CSA login не содержит сессионную cookie JSESSIONID"));
    }

    // Save active session cookie with 25-minute expiry
    const stored = await getStoredSberSession();
    if (stored) {
      stored.sessionCookie = sessionCookie;
      stored.sessionExpiresAt = Date.now() + 25 * 60 * 1000;
      stored.cookies = this.cookies;
      await setStoredSberSession(stored);
    }

    return ok(sessionCookie);
  }
}

// -----------------------------------------------------------------------------
// High-Level Business API
// -----------------------------------------------------------------------------

/**
 * Fetches all products (cards, accounts, loans) from /mobile9/private/products/list.do.
 * Automatically performs login if session cookie is missing or expired.
 */
export async function getSberAccounts(): Promise<Result<SberProduct[], Error>> {
  const session = await getStoredSberSession();
  if (!session || !session.mGuid) {
    return err(new Error("Not authenticated in Sberbank"));
  }

  const authSession = new SberbankAuthSession();
  if (session.cookies) {
    authSession.cookies = { ...session.cookies };
  }

  let cookie = session.sessionCookie;
  const isExpired = !session.sessionExpiresAt || Date.now() >= session.sessionExpiresAt;

  if (!cookie || isExpired) {
    const loginRes = await authSession.login(session.mGuid, session.pin || SBER_DEFAULT_PIN);
    if (loginRes.error !== null) {
      return err(new AggregateError([loginRes.error], "Failed to refresh Sberbank session"));
    }
    cookie = loginRes.data;
  }

  const fetchProducts = async (jsessionId: string): Promise<Result<SberProduct[], Error>> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `JSESSIONID=${jsessionId}`,
    };

    const res = await proxyFetch(SBER_BASE_URL + "mobile9/private/products/list.do", {
      method: "POST",
      headers,
      body: "showProductType=cards,accounts,imaccounts,loans",
    });

    if (res.error !== null) {
      return err(new AggregateError([res.error], "Failed to request products list"));
    }

    const bodyText = res.data.body || "";
    const doc = parseXml(bodyText);
    const code = getFirstTagText(doc, "code");

    if (code && code !== "0") {
      return err(new Error(`Банк вернул статус: ${code}`));
    }

    const products = parseSberProductsXml(bodyText);
    return ok(products);
  };

  let prodRes = await fetchProducts(cookie);
  if (prodRes.error !== null) {
    // Retry once with a fresh login
    const loginRes = await authSession.login(session.mGuid, session.pin || SBER_DEFAULT_PIN);
    if (loginRes.error !== null) {
      return err(new AggregateError([loginRes.error], "Failed to re-login to Sberbank"));
    }
    cookie = loginRes.data;
    prodRes = await fetchProducts(cookie);
    if (prodRes.error !== null) {
      return err(new AggregateError([prodRes.error], "Failed to fetch Sberbank products after re-login"));
    }
  }

  return ok(prodRes.data);
}
