import "ts-error-as-value/lib/globals";
import { proxyFetch } from "./proxy";
import { JsonStore } from "./json_store";

// -----------------------------------------------------------------------------
// Constants & Configuration
// -----------------------------------------------------------------------------

export const SBER_APP_ORIGIN = "https://online.sberbank.ru";
export const SBER_AUTH_PAGE = "https://online.sberbank.ru/CSAFront/index.do";
export const SBER_PRIMARY_AUTH_URL = "https://online.sberbank.ru/CSAFront/authMainJson.do";
export const SBER_PIN_CREATE_URL = "https://online.sberbank.ru/CSAFront/api/v1/pin/create";
export const SBER_AUTH_FINISH_URL = "https://online.sberbank.ru/CSAFront/api/v1/auth";
export const SBER_DEFAULT_API_BASE = "https://web-standin2.online.sberbank.ru";
export const SBER_PRODUCTS_PATH = "/main-screen/rest/v2/m1/web/section/meta";

export const SBER_SESSION_STORAGE_KEY = "sber_session";
export const SBER_DEFAULT_PIN = "42424";

export const SBER_CHROME_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Sec-CH-UA": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
  "Sec-CH-UA-Mobile": "?0",
  "Sec-CH-UA-Platform": '"Windows"',
  "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
};

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export interface SberSession {
  ufsSession: string;
  ufsToken: string;
  apiBase?: string;
  webBase?: string;
  login?: string;
  pin?: string;
  deviceprint?: string;
  cookies?: Record<string, string>;
  lastUpdated?: number;
}

export interface SberProduct {
  id: string;
  name: string;
  type: "card" | "account" | "deposit" | "other";
  number?: string;
  cardAccount?: string;
  balance: number;
  currencyCode: string;
  currencyName: string;
  state?: string;
  isBlocked?: boolean;
}

// -----------------------------------------------------------------------------
// Storage
// -----------------------------------------------------------------------------

export async function getStoredSberSession(): Promise<SberSession | null> {
  const res = await JsonStore.getJson<SberSession>(SBER_SESSION_STORAGE_KEY);
  if (res.error !== null || !res.data || !res.data.ufsSession || !res.data.ufsToken) {
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
// Cookie Utilities
// -----------------------------------------------------------------------------

/**
 * Parses user-provided cookie string, JSON, or header containing UFS-SESSION and UFS-TOKEN.
 */
export function parseSberCookies(raw: string): { ufsSession?: string; ufsToken?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  // 1. Try parsing as JSON (e.g. {"ufs_session": "...", "ufs_token": "..."} or {"UFS-SESSION": "..."})
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj === "object" && obj !== null) {
      const ufsSession =
        obj.ufs_session ||
        obj["UFS-SESSION"] ||
        obj.ufsSession ||
        obj["ufs-session"];
      const ufsToken =
        obj.ufs_token ||
        obj["UFS-TOKEN"] ||
        obj.ufsToken ||
        obj["ufs-token"];
      if (ufsSession && ufsToken) {
        return {
          ufsSession: String(ufsSession).trim(),
          ufsToken: String(ufsToken).trim(),
        };
      }
    }
  } catch {
    // Not JSON, continue to cookie string regex
  }

  // 2. Extract from Netscape or Cookie header format: UFS-SESSION=xxx; UFS-TOKEN=yyy
  const sessionMatch = trimmed.match(/(?:^|[;\s])UFS-SESSION=([^;\r\n\t\s]+)/i);
  const tokenMatch = trimmed.match(/(?:^|[;\s])UFS-TOKEN=([^;\r\n\t\s]+)/i);

  const ufsSession = sessionMatch ? sessionMatch[1].trim() : undefined;
  const ufsToken = tokenMatch ? tokenMatch[1].trim() : undefined;

  return { ufsSession, ufsToken };
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

// -----------------------------------------------------------------------------
// BigInt & Crypto Helpers for SRP-512 & RSA-OAEP
// -----------------------------------------------------------------------------

function hexToBigInt(hex: string): bigint {
  return BigInt("0x" + hex);
}

function bigIntToBytes(val: bigint): Uint8Array {
  let hex = val.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  const len = hex.length / 2;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return u8;
}

function padBytes(val: bigint, width: number): Uint8Array {
  const bytes = bigIntToBytes(val);
  if (bytes.length >= width) return bytes;
  const res = new Uint8Array(width);
  res.set(bytes, width - bytes.length);
  return res;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let res = BigInt(1);
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > BigInt(0)) {
    if (e % BigInt(2) === BigInt(1)) res = (res * b) % mod;
    e = e / BigInt(2);
    b = (b * b) % mod;
  }
  return res;
}

async function subtleSha512(...parts: Uint8Array[]): Promise<Uint8Array> {
  let totalLen = 0;
  for (const p of parts) totalLen += p.length;
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    combined.set(p, offset);
    offset += p.length;
  }
  const hashBuf = await crypto.subtle.digest("SHA-512", combined.buffer as ArrayBuffer);
  return new Uint8Array(hashBuf);
}

async function subtleSha512BigInt(...parts: Uint8Array[]): Promise<bigint> {
  const buf = await subtleSha512(...parts);
  let hex = "";
  for (let i = 0; i < buf.length; i++) {
    hex += buf[i].toString(16).padStart(2, "0");
  }
  return BigInt("0x" + hex);
}

async function subtleSha1(data: Uint8Array): Promise<Uint8Array> {
  const hashBuf = await crypto.subtle.digest("SHA-1", data.buffer as ArrayBuffer);
  return new Uint8Array(hashBuf);
}

async function subtleMgf1(seed: Uint8Array, length: number): Promise<Uint8Array> {
  const result = new Uint8Array(length);
  let offset = 0;
  let counter = 0;
  while (offset < length) {
    const counterBytes = new Uint8Array(4);
    counterBytes[0] = (counter >>> 24) & 0xff;
    counterBytes[1] = (counter >>> 16) & 0xff;
    counterBytes[2] = (counter >>> 8) & 0xff;
    counterBytes[3] = counter & 0xff;

    const input = new Uint8Array(seed.length + 4);
    input.set(seed, 0);
    input.set(counterBytes, seed.length);

    const digest = await subtleSha1(input);
    const toCopy = Math.min(digest.length, length - offset);
    result.set(digest.subarray(0, toCopy), offset);
    offset += toCopy;
    counter++;
  }
  return result;
}

function parseDerInteger(data: Uint8Array, offset: number): { val: bigint; nextOffset: number } {
  if (data[offset] !== 0x02) throw new Error("expected INTEGER tag in DER");
  offset++;
  let length = data[offset];
  offset++;
  if (length & 0x80) {
    const nBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < nBytes; i++) {
      length = (length << 8) | data[offset++];
    }
  }
  const intBytes = data.subarray(offset, offset + length);
  let hex = "";
  for (let i = 0; i < intBytes.length; i++) {
    hex += intBytes[i].toString(16).padStart(2, "0");
  }
  return { val: BigInt("0x" + hex), nextOffset: offset + length };
}

function parseRsaPublicKeyDer(b64Der: string): { modulus: bigint; exponent: bigint } {
  const cleanB64 = b64Der.replace(/\s+/g, "");
  const binaryString = atob(cleanB64);
  const der = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    der[i] = binaryString.charCodeAt(i);
  }

  let modulus = BigInt(0);
  let exponent = BigInt(0);
  for (let i = 0; i < der.length - 10; i++) {
    if (der[i] === 0x02) {
      try {
        const r1 = parseDerInteger(der, i);
        if (r1.val > (BigInt(2) ** BigInt(1024)) && der[r1.nextOffset] === 0x02) {
          const r2 = parseDerInteger(der, r1.nextOffset);
          modulus = r1.val;
          exponent = r2.val;
          break;
        }
      } catch {
        // Continue searching
      }
    }
  }
  if (modulus === BigInt(0) || exponent === BigInt(0)) throw new Error("Could not parse RSA public key from DER");
  return { modulus, exponent };
}

/**
 * Encrypts a PIN string using RSA-OAEP with SHA-1, matching Sber's node-forge frontend logic.
 */
export async function rsaOaepEncrypt(publicKeyB64: string, text: string): Promise<string> {
  const { modulus, exponent } = parseRsaPublicKeyDer(publicKeyB64);
  const width = Math.floor((modulus.toString(2).length + 7) / 8);
  const message = new TextEncoder().encode(text);
  const digestSize = 20; // SHA-1

  if (message.length > width - 2 * digestSize - 2) {
    throw new Error("Message too long for RSA-OAEP key");
  }

  const seed = new Uint8Array(digestSize);
  crypto.getRandomValues(seed);

  const emptyHash = await subtleSha1(new Uint8Array(0));
  const padLen = width - message.length - 2 * digestSize - 2;
  const dataBlock = new Uint8Array(emptyHash.length + padLen + 1 + message.length);
  dataBlock.set(emptyHash, 0);
  dataBlock.fill(0, emptyHash.length, emptyHash.length + padLen);
  dataBlock[emptyHash.length + padLen] = 0x01;
  dataBlock.set(message, emptyHash.length + padLen + 1);

  const dbMask = await subtleMgf1(seed, width - digestSize - 1);
  const maskedData = new Uint8Array(dataBlock.length);
  for (let i = 0; i < dataBlock.length; i++) maskedData[i] = dataBlock[i] ^ dbMask[i];

  const seedMask = await subtleMgf1(maskedData, digestSize);
  const maskedSeed = new Uint8Array(seed.length);
  for (let i = 0; i < seed.length; i++) maskedSeed[i] = seed[i] ^ seedMask[i];

  const encoded = new Uint8Array(width);
  encoded[0] = 0x00;
  encoded.set(maskedSeed, 1);
  encoded.set(maskedData, 1 + maskedSeed.length);

  let hex = "";
  for (let i = 0; i < encoded.length; i++) hex += encoded[i].toString(16).padStart(2, "0");
  const encodedInt = BigInt("0x" + hex);

  const encryptedInt = modPow(encodedInt, exponent, modulus);
  const encryptedBytes = padBytes(encryptedInt, width);

  let binary = "";
  for (let i = 0; i < encryptedBytes.length; i++) {
    binary += String.fromCharCode(encryptedBytes[i]);
  }
  return btoa(binary);
}

/**
 * Generates synthetic deviceprint in the format of window.bfd.getData().
 */
export function generateDeviceprint(): string {
  const randomHex = (len: number): string => {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  };

  const uuid = `${randomHex(4)}-${randomHex(2)}-4${randomHex(1).slice(1)}-${randomHex(2)}-${randomHex(6)}`;

  const fields: Record<string, string> = {
    version: "5.3.0",
    os: "Windows",
    osVersion: "10.0",
    browser: "Chrome",
    browserVersion: "146.0.0.0",
    platform: "Win32",
    screen: "1920x1080",
    colorDepth: "24",
    timezone: "-180",
    language: "ru-RU",
    cpuCores: "8",
    canvas: randomHex(16),
    webgl: randomHex(16),
    fonts: randomHex(8),
    audio: randomHex(8),
    uuid,
  };

  return Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

// -----------------------------------------------------------------------------
// Products Parser
// -----------------------------------------------------------------------------

/**
 * Parses modern Sberbank products JSON response from /main-screen/rest/v2/m1/web/section/meta.
 */
export function parseModernSberProducts(payload: unknown): SberProduct[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  let data: any = root; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const key of ["body", "sections", "technicalSection", "sectionProductData"]) {
    if (data && typeof data === "object" && data[key]) {
      data = data[key];
    }
  }
  if (!data || typeof data !== "object") return [];

  const accountsList: any[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
    ...(Array.isArray(data.ctaccounts?.data) ? data.ctaccounts.data : []),
    ...(Array.isArray(data.sharingCtAccounts?.data) ? data.sharingCtAccounts.data : []),
    ...(Array.isArray(data.accounts?.data) ? data.accounts.data : []),
  ];
  const cardsList: any[] = Array.isArray(data.cardsInWallet?.data) ? data.cardsInWallet.data : []; // eslint-disable-line @typescript-eslint/no-explicit-any

  const products: SberProduct[] = [];
  const accountNumbers = new Map<string, { id: string; balance: number }>();

  for (const item of accountsList) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "");
    const name = String(item.name || "Счёт");
    const number = String(item.number || "");
    const balanceObj = item.balance;
    const rawAmt = balanceObj && balanceObj.amount !== undefined ? Number(balanceObj.amount) : 0;
    const balance = isNaN(rawAmt) ? 0 : rawAmt;
    const currencyCode = String(balanceObj?.currencyCode || balanceObj?.currency?.code || "RUB");
    const isBlocked = item.arrested === true || item.state === "BLOCKED";

    if (number) {
      accountNumbers.set(number, { id, balance });
    }

    products.push({
      id,
      name,
      type: "account",
      number,
      balance,
      currencyCode,
      currencyName: currencyCode === "RUB" || currencyCode === "643" ? "руб." : currencyCode,
      state: item.state ? String(item.state) : undefined,
      isBlocked,
    });
  }

  for (const item of cardsList) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "");
    const name = String(item.name || "Карта");
    const number = String(item.number || "");
    const cardAccount = String(item.cardAccount || "");
    const isCTA = item.isCTA === true;

    const parent = isCTA && cardAccount ? accountNumbers.get(cardAccount) : undefined;
    const balanceKey = parent ? "availableTotalLimit" : "availableLimit";
    const balanceObj = item[balanceKey] || item.availableLimit || item.balance;
    const rawAmt = balanceObj && balanceObj.amount !== undefined ? Number(balanceObj.amount) : 0;
    const balance = isNaN(rawAmt) ? 0 : rawAmt;
    const currencyCode = String(balanceObj?.currencyCode || balanceObj?.currency?.code || "RUB");
    const isBlocked = item.arrested === true || item.state === "BLOCKED";

    products.push({
      id,
      name,
      type: "card",
      number,
      cardAccount: cardAccount || undefined,
      balance,
      currencyCode,
      currencyName: currencyCode === "RUB" || currencyCode === "643" ? "руб." : currencyCode,
      state: item.state ? String(item.state) : undefined,
      isBlocked,
    });
  }

  return products;
}

// -----------------------------------------------------------------------------
// Sberbank Web API Client
// -----------------------------------------------------------------------------

/**
 * Executes a request to Sberbank Online products endpoint with session cookies.
 */
export async function fetchSberProducts(session: SberSession): Promise<Result<SberProduct[], Error>> {
  if (!session.ufsSession || !session.ufsToken) {
    return err(new Error("Отсутствуют cookies сессии (UFS-SESSION / UFS-TOKEN)"));
  }

  const apiBase = session.apiBase || SBER_DEFAULT_API_BASE;
  const targetUrl = `${apiBase.replace(/\/+$/, "")}${SBER_PRODUCTS_PATH}`;

  const cookieParts: string[] = [];
  if (session.cookies) {
    for (const [k, v] of Object.entries(session.cookies)) {
      if (k !== "UFS-SESSION" && k !== "UFS-TOKEN") {
        cookieParts.push(`${k}=${v}`);
      }
    }
  }
  cookieParts.push(`UFS-SESSION=${session.ufsSession}`);
  cookieParts.push(`UFS-TOKEN=${session.ufsToken}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    Origin: SBER_APP_ORIGIN,
    Referer: `${SBER_APP_ORIGIN}/`,
    Cookie: cookieParts.join("; "),
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    ...SBER_CHROME_HEADERS,
  };

  const res = await proxyFetch(targetUrl, {
    method: "POST",
    headers,
    body: { withData: true, forceUpdate: false },
    impersonate: "chrome",
  });

  if (res.error !== null) {
    return err(new AggregateError([res.error], "Не удалось сделать запрос к API СберБанка"));
  }

  if (res.data.status === 401 || res.data.status === 403) {
    return err(new Error("Сессия СберБанка истекла или недействительна (HTTP " + res.data.status + ")"));
  }

  const jsonResult = await res.data.json<Record<string, unknown>>();
  if (jsonResult.error !== null) {
    return err(new AggregateError([jsonResult.error], "СберБанк вернул некорректный ответ"));
  }

  const data = jsonResult.data;
  if (!data || data.success === false) {
    const errorObj = data?.error as Record<string, unknown> | undefined;
    const errorMsg = (errorObj?.title || errorObj?.text || "Ошибка получения продуктов") as string;
    return err(new Error(errorMsg));
  }

  const products = parseModernSberProducts(data);
  return ok(products);
}

/**
 * Public high-level function to get accounts & cards using the stored session.
 */
export async function getSberAccounts(): Promise<Result<SberProduct[], Error>> {
  const session = await getStoredSberSession();
  if (!session || !session.ufsSession || !session.ufsToken) {
    return err(new Error("Не авторизован в СберБанке"));
  }

  return await fetchSberProducts(session);
}

// -----------------------------------------------------------------------------
// Interactive Web SRP Login Session
// -----------------------------------------------------------------------------

export interface SrpConfig {
  nHex: string;
  gHex: string;
  processId: string;
  baseApiUrl: string;
}

export class SberWebAuthSession {
  private config: SrpConfig | null = null;
  private clientA: bigint = BigInt(0);
  private clientSecretA: bigint = BigInt(0);
  private srpN: bigint = BigInt(0);
  private srpG: bigint = BigInt(2);
  private token: string | null = null;
  private loginValue: string = "";
  private passwordValue: string = "";
  private deviceprint: string = "";
  public expectedM2: Uint8Array | null = null;
  private pinPublicKey: string | null = null;
  private csrfToken: string | null = null;
  private cookies: Record<string, string> = {};

  constructor() {
    this.deviceprint = generateDeviceprint();
  }

  private updateCookies(multiValueHeaders?: Record<string, string[]>): void {
    const newCookies = parseSetCookieHeaders(multiValueHeaders);
    this.cookies = { ...this.cookies, ...newCookies };
  }

  private getCookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  private parseConfigFromHtml(html: string): SrpConfig {
    const idx = html.indexOf("window.config = {");
    if (idx === -1) {
      throw new Error("Не удалось обнаружить конфигурацию на странице входа СберБанка");
    }

    let depth = 0;
    let end = idx;
    for (let i = idx + "window.config =".length; i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    const configStr = html.slice(idx, end);
    const processIdMatch = configStr.match(/processId:\s*"([^"]+)"/);
    const nMatch = configStr.match(/srpConfig:\s*\{[\s\S]*?N:\s*"([^"]+)"/);
    const gMatch = configStr.match(/srpConfig:\s*\{[\s\S]*?g:\s*"([^"]+)"/);
    const baseApiMatch = configStr.match(/baseApiUrl:\s*"([^"]+)"/);

    if (!processIdMatch || !nMatch) {
      throw new Error("Не удалось извлечь SRP параметры СберБанка");
    }

    return {
      processId: processIdMatch[1],
      nHex: nMatch[1],
      gHex: gMatch ? gMatch[1] : "2",
      baseApiUrl: baseApiMatch ? baseApiMatch[1] : "CSAFront",
    };
  }

  /**
   * Step 1: Initiates SRP authentication with login and password.
   * Prompts Sberbank to verify the password and send the SMS verification code!
   */
  async startLogin(
    login: string,
    pass: string
  ): Promise<Result<{ needsOtp: boolean; timeout?: number }, Error>> {
    this.loginValue = login.trim();
    this.passwordValue = pass;
    this.cookies = {};

    // 1. Fetch CSAFront/index.do with Chrome headers and cookie capture
    const pageHeaders: Record<string, string> = {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      ...SBER_CHROME_HEADERS,
    };
    const pageRes = await proxyFetch(SBER_AUTH_PAGE, {
      method: "GET",
      headers: pageHeaders,
      impersonate: "chrome",
    });

    if (pageRes.error !== null) {
      return err(new AggregateError([pageRes.error], "Не удалось загрузить страницу входа СберБанка"));
    }

    this.updateCookies(pageRes.data.multiValueHeaders);

    const configParse = await withResult(() => this.parseConfigFromHtml(pageRes.data.body || ""))();
    if (configParse.error !== null) {
      return err(new AggregateError([configParse.error], "Ошибка разбора страницы СберБанка"));
    }

    this.config = configParse.data;
    this.srpN = hexToBigInt(this.config.nHex);
    this.srpG = BigInt(this.config.gHex);

    // Generate client secret a and public A
    const width = Math.floor((this.srpN.toString(2).length + 7) / 8);
    const aBytes = new Uint8Array(Math.floor(width / 8) || 32);
    crypto.getRandomValues(aBytes);
    let aHex = "";
    for (let i = 0; i < aBytes.length; i++) aHex += aBytes[i].toString(16).padStart(2, "0");
    this.clientSecretA = BigInt("0x" + aHex);
    this.clientA = modPow(this.srpG, this.clientSecretA, this.srpN);

    // 2. Post button.begin
    const beginForm = new URLSearchParams({
      deviceprint: this.deviceprint,
      jsEvents: "",
      domElements: "",
      operation: "button.begin",
      login: this.loginValue,
      pageInputType: "INDEX",
      storeLogin: "true",
      srp_A: this.clientA.toString(16),
      publicKeyCredentialAvailable: "true",
    });

    const cookieHeader = this.getCookieHeader();
    const primaryHeaders: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: SBER_APP_ORIGIN,
      Referer: SBER_AUTH_PAGE,
      "Process-Id": this.config.processId,
      "X-TS-AJAX-Request": "true",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      ...SBER_CHROME_HEADERS,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const beginRes = await proxyFetch(SBER_PRIMARY_AUTH_URL, {
      method: "POST",
      headers: primaryHeaders,
      body: beginForm.toString(),
      impersonate: "chrome",
    });

    if (beginRes.error !== null) {
      return err(new AggregateError([beginRes.error], "Ошибка запроса начала входа"));
    }

    this.updateCookies(beginRes.data.multiValueHeaders);

    const beginJsonRes = await beginRes.data.json<Record<string, any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (beginJsonRes.error !== null) {
      return err(new AggregateError([beginJsonRes.error], "Некорректный ответ от сервера СберБанка"));
    }

    const beginPayload = beginJsonRes.data;
    if (beginPayload.error && beginPayload.error.code !== 200) {
      const errCode = beginPayload.error.code;
      if (beginPayload.error.captcha) {
        return err(new Error("СберБанк запросил капчу (рекомендуется войти по Cookie)"));
      }
      return err(new Error(`Ошибка СберБанка: ${errCode}`));
    }

    const token = beginPayload.token;
    const srpInfo = beginPayload.srpInfo;
    if (!token || !srpInfo || !srpInfo.srp_s || !srpInfo.srp_B) {
      return err(new Error("Ответ СберБанка не содержит SRP challenge"));
    }
    this.token = token;

    // 3. Compute SRP-512 challenge proof m1
    const salt = hexToBigInt(srpInfo.srp_s);
    const serverB = hexToBigInt(srpInfo.srp_B);

    const k = await subtleSha512BigInt(padBytes(this.srpN, width), padBytes(this.srpG, width));
    const x = await subtleSha512BigInt(
      bigIntToBytes(salt),
      new TextEncoder().encode(this.passwordValue)
    );
    const u = await subtleSha512BigInt(padBytes(this.clientA, width), padBytes(serverB, width));
    const shared = modPow(
      (serverB - k * modPow(this.srpG, x, this.srpN)) % this.srpN,
      this.clientSecretA + u * x,
      this.srpN
    );
    const sessionHash = await subtleSha512(padBytes(shared, width));

    const hN = await subtleSha512(bigIntToBytes(this.srpN));
    const hG = await subtleSha512(bigIntToBytes(this.srpG));
    const xorBuf = new Uint8Array(hN.length);
    for (let i = 0; i < hN.length; i++) xorBuf[i] = hN[i] ^ hG[i];

    const m1 = await subtleSha512(
      xorBuf,
      bigIntToBytes(salt),
      padBytes(this.clientA, width),
      padBytes(serverB, width),
      sessionHash
    );

    let m1Hex = "";
    for (let i = 0; i < m1.length; i++) m1Hex += m1[i].toString(16).padStart(2, "0");
    const m1Int = BigInt("0x" + m1Hex);

    this.expectedM2 = await subtleSha512(
      padBytes(this.clientA, width),
      bigIntToBytes(m1Int),
      sessionHash
    );

    // 4. Send SRP proof m1 -> Triggers the actual SMS!
    const step2Form = new URLSearchParams({
      deviceprint: this.deviceprint,
      jsEvents: "",
      domElements: "",
      "org.apache.struts.taglib.html.TOKEN": this.token || "",
      operation: "button.next",
      login: this.loginValue,
      pageInputType: "INDEX",
      storeLogin: "true",
      srp_M: m1Int.toString(16),
      token: this.token || "",
    });

    const step2CookieHeader = this.getCookieHeader();
    const step2Headers: Record<string, string> = {
      ...primaryHeaders,
      ...(step2CookieHeader ? { Cookie: step2CookieHeader } : {}),
    };

    const step2Res = await proxyFetch(SBER_PRIMARY_AUTH_URL, {
      method: "POST",
      headers: step2Headers,
      body: step2Form.toString(),
      impersonate: "chrome",
    });

    if (step2Res.error !== null) {
      return err(new AggregateError([step2Res.error], "Ошибка отправки SRP доказательства"));
    }

    this.updateCookies(step2Res.data.multiValueHeaders);

    const step2JsonRes = await step2Res.data.json<Record<string, any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (step2JsonRes.error !== null) {
      return err(new AggregateError([step2JsonRes.error], "Некорректный ответ от сервера СберБанка"));
    }

    const step2Payload = step2JsonRes.data;
    if (step2Payload.token) {
      this.token = step2Payload.token;
    }

    if (step2Payload.state === "NEED_CONFIRM") {
      return ok({
        needsOtp: true,
        timeout: typeof step2Payload.timeout === "number" ? step2Payload.timeout : 120,
      });
    }

    if (step2Payload.state === "WRONG_PASS") {
      return err(new Error("Неверный логин или пароль СберБанка"));
    }

    return err(new Error(`Неожиданный ответ СберБанка: ${step2Payload.state || "unknown"}`));
  }

  /**
   * Step 2: Confirms SMS OTP code and sets PIN to complete session enrollment.
   */
  async confirmOtp(smsCode: string): Promise<Result<SberSession, Error>> {
    if (!this.config || !this.token) {
      return err(new Error("Сессия аутентификации не инициализирована"));
    }

    const confirmForm = new URLSearchParams({
      deviceprint: this.deviceprint,
      jsEvents: "",
      domElements: "",
      "org.apache.struts.taglib.html.TOKEN": this.token,
      operation: "button.next",
      confirmPassword: smsCode.trim(),
      pageInputType: "INDEX",
      token: this.token,
    });

    const cookieHeader = this.getCookieHeader();
    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: SBER_APP_ORIGIN,
      Referer: SBER_AUTH_PAGE,
      "Process-Id": this.config.processId,
      "X-TS-AJAX-Request": "true",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      ...SBER_CHROME_HEADERS,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };

    const confirmRes = await proxyFetch(SBER_PRIMARY_AUTH_URL, {
      method: "POST",
      headers,
      body: confirmForm.toString(),
      impersonate: "chrome",
    });

    if (confirmRes.error !== null) {
      return err(new AggregateError([confirmRes.error], "Ошибка отправки СМС-кода"));
    }

    this.updateCookies(confirmRes.data.multiValueHeaders);
    this.csrfToken = confirmRes.data.headers.get("x-csrf-token");

    const confirmJson = await confirmRes.data.json<Record<string, any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (confirmJson.error !== null) {
      return err(new AggregateError([confirmJson.error], "Некорректный ответ подтверждения СМС"));
    }

    const confirmPayload = confirmJson.data;
    if (confirmPayload.token) {
      this.token = confirmPayload.token;
    }

    if (confirmPayload.state === "WRONG_PASS") {
      return err(new Error("Введён неверный СМС-код"));
    }

    const pinInfo = confirmPayload.pinInfo;
    if (pinInfo && pinInfo.publicKey) {
      this.pinPublicKey = pinInfo.publicKey;
    }

    // If PIN enrollment is needed
    if (this.pinPublicKey) {
      const encryptedPin = await rsaOaepEncrypt(this.pinPublicKey, SBER_DEFAULT_PIN);
      const pinCookieHeader = this.getCookieHeader();
      const pinHeaders: Record<string, string> = {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: SBER_APP_ORIGIN,
        Referer: SBER_AUTH_PAGE,
        "Process-Id": this.config.processId,
        "X-TS-AJAX-Request": "true",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        ...SBER_CHROME_HEADERS,
        ...(pinCookieHeader ? { Cookie: pinCookieHeader } : {}),
        ...(this.csrfToken ? { "X-CSRF-Token": this.csrfToken } : {}),
      };

      const pinRes = await proxyFetch(SBER_PIN_CREATE_URL, {
        method: "POST",
        headers: pinHeaders,
        body: { pin: encryptedPin, deviceprint: this.deviceprint },
        impersonate: "chrome",
      });

      if (pinRes.error !== null) {
        return err(new AggregateError([pinRes.error], "Ошибка создания PIN кода"));
      }
      this.updateCookies(pinRes.data.multiValueHeaders);
      if (pinRes.data.headers.get("x-csrf-token")) {
        this.csrfToken = pinRes.data.headers.get("x-csrf-token");
      }
    }

    // Finish auth to get redirect URL
    const finishCookieHeader = this.getCookieHeader();
    const finishHeaders: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Origin: SBER_APP_ORIGIN,
      Referer: SBER_AUTH_PAGE,
      "Process-Id": this.config.processId,
      "X-TS-AJAX-Request": "true",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      ...SBER_CHROME_HEADERS,
      ...(finishCookieHeader ? { Cookie: finishCookieHeader } : {}),
      ...(this.csrfToken ? { "X-CSRF-Token": this.csrfToken } : {}),
    };

    const finishRes = await proxyFetch(SBER_AUTH_FINISH_URL, {
      method: "POST",
      headers: finishHeaders,
      body: { deviceprint: this.deviceprint },
      impersonate: "chrome",
    });

    if (finishRes.error !== null) {
      return err(new AggregateError([finishRes.error], "Ошибка завершения авторизации"));
    }
    this.updateCookies(finishRes.data.multiValueHeaders);

    const finishJson = await finishRes.data.json<Record<string, any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    const redirectUrl = finishJson.data?.redirect || confirmPayload.redirect;
    if (!redirectUrl) {
      return err(new Error("Сервер не предоставил URL перенаправления сессии"));
    }

    // Follow seamless redirect to receive UFS-SESSION and UFS-TOKEN cookies
    const redirectCookieHeader = this.getCookieHeader();
    const redirectRes = await proxyFetch(redirectUrl, {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json; charset=utf-8",
        Origin: SBER_APP_ORIGIN,
        Referer: `${SBER_APP_ORIGIN}/`,
        "X-Seamless-Web": "true",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        ...SBER_CHROME_HEADERS,
        ...(redirectCookieHeader ? { Cookie: redirectCookieHeader } : {}),
      },
      body: null,
      impersonate: "chrome",
    });

    if (redirectRes.error !== null) {
      return err(new AggregateError([redirectRes.error], "Ошибка перехода по ссылке сессии"));
    }

    this.updateCookies(redirectRes.data.multiValueHeaders);

    let ufsSession = this.cookies["UFS-SESSION"];
    let ufsToken = this.cookies["UFS-TOKEN"];

    if (!ufsSession || !ufsToken) {
      // Also check body or cookies from previous calls
      const parsed = parseSberCookies(redirectRes.data.body || "");
      if (parsed.ufsSession && parsed.ufsToken) {
        ufsSession = parsed.ufsSession;
        ufsToken = parsed.ufsToken;
      }
    }

    if (!ufsSession || !ufsToken) {
      return err(new Error("Не удалось получить UFS-SESSION / UFS-TOKEN из ответа банка"));
    }

    const session: SberSession = {
      ufsSession,
      ufsToken,
      apiBase: SBER_DEFAULT_API_BASE,
      login: this.loginValue,
      deviceprint: this.deviceprint,
      lastUpdated: Date.now(),
      cookies: this.cookies,
    };

    await setStoredSberSession(session);
    return ok(session);
  }
}
