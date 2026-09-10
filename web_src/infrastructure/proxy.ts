import "ts-error-as-value/lib/globals";



export interface ProxyEnvelope {
  statusCode?: number;
  status?: number;
  body?: unknown;
  multiValueHeaders?: Record<string, string[]>;
}

export interface ProxyRequestInit {
  method?: string;
  headers?: HeadersInit | Record<string, string | string[] | number | boolean>;
  body?: BodyInit | Record<string, unknown> | Array<unknown> | null;
  /**
   * Override the proxy endpoint URL (defaults to DEFAULT_PROXY_ENDPOINT or getProxyEndpoint()).
   */
  proxyEndpoint?: string;
  /**
   * Optional client impersonation (e.g. "chrome" for browser TLS and Client Hints impersonation).
   */
  impersonate?: string;
}

export interface ProxyResponse {
  readonly status: number;
  readonly statusCode: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly headers: Headers;
  readonly multiValueHeaders: Record<string, string[]>;
  readonly body: string;
  text(): Promise<Result<string, Error>>;
  json<T = unknown>(): Promise<Result<T, Error>>;
}

export interface ProxyRequestBody {
  method: string;
  url: string;
  body: string | null;
  isBase64Encoded?: boolean;
  multiValueHeaders?: Record<string, string[]>;
  impersonate?: string;
}

export const DEFAULT_PROXY_ENDPOINT =
  "https://d5dli0ro6bbf30tqr35v.lievo6ut.apigw.yandexcloud.net/proxy";
let configuredProxyEndpoint = DEFAULT_PROXY_ENDPOINT;

export function getProxyEndpoint(): string {
  if (typeof window !== "undefined" && window.localStorage) {
    const saved = window.localStorage.getItem("mmm_proxy_endpoint");
    if (saved && saved !== "/proxy") return saved;
  }
  return configuredProxyEndpoint;
}

export function setProxyEndpoint(endpoint: string): void {
  configuredProxyEndpoint = endpoint;
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem("mmm_proxy_endpoint", endpoint);
  }
}

export function resetProxyEndpoint(): string {
  configuredProxyEndpoint = DEFAULT_PROXY_ENDPOINT;
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.removeItem("mmm_proxy_endpoint");
  }
  return DEFAULT_PROXY_ENDPOINT;
}

const STATUS_TEXTS: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  408: "Request Timeout",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

export function createProxyResponse(
  statusCode: number,
  body: string,
  multiValueHeaders?: Record<string, string[]>
): ProxyResponse {
  const headers = new Headers();
  if (multiValueHeaders) {
    for (const [key, values] of Object.entries(multiValueHeaders)) {
      if (Array.isArray(values)) {
        for (const val of values) {
          headers.append(key, val);
        }
      }
    }
  }

  const okStatus = statusCode >= 200 && statusCode < 300;
  const statusText = STATUS_TEXTS[statusCode] || (okStatus ? "OK" : "");

  return {
    status: statusCode,
    statusCode: statusCode,
    statusText,
    ok: okStatus,
    headers,
    multiValueHeaders: multiValueHeaders || {},
    body,
    async text(): Promise<Result<string, Error>> {
      return ok(body);
    },
    async json<T = unknown>(): Promise<Result<T, Error>> {
      const parsed = await withResult(JSON.parse)(body);
      if (parsed.error !== null) {
        return err(new AggregateError([parsed.error], "failed to parse response body as JSON"));
      }
      return ok(parsed.data as T);
    },
  };
}

function normalizeHeaders(
  headersInit?: HeadersInit | Record<string, string | string[] | number | boolean>
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!headersInit) {
    return result;
  }

  if (headersInit instanceof Headers) {
    headersInit.forEach((value, key) => {
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(value);
    });
    return result;
  }

  if (Array.isArray(headersInit)) {
    for (const [key, value] of headersInit) {
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(value);
    }
    return result;
  }

  if (typeof headersInit === "object") {
    for (const [key, value] of Object.entries(headersInit)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        result[key] = value.map(String);
      } else {
        result[key] = [String(value)];
      }
    }
  }

  return result;
}

function processBody(
  bodyInit?: BodyInit | Record<string, unknown> | Array<unknown> | null,
  headers: Record<string, string[]> = {}
): { bodyStr: string | null; isBase64Encoded?: boolean } {
  if (bodyInit === undefined || bodyInit === null) {
    return { bodyStr: null };
  }

  if (typeof bodyInit === "string") {
    return { bodyStr: bodyInit };
  }

  if (bodyInit instanceof URLSearchParams) {
    const hasContentType = Object.keys(headers).some(
      (k) => k.toLowerCase() === "content-type"
    );
    if (!hasContentType) {
      headers["Content-Type"] = ["application/x-www-form-urlencoded;charset=UTF-8"];
    }
    return { bodyStr: bodyInit.toString() };
  }

  if (bodyInit instanceof Uint8Array || bodyInit instanceof ArrayBuffer) {
    const bytes = bodyInit instanceof ArrayBuffer ? new Uint8Array(bodyInit) : bodyInit;
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return {
      bodyStr: btoa(binary),
      isBase64Encoded: true,
    };
  }

  if (typeof bodyInit === "object") {
    const hasContentType = Object.keys(headers).some(
      (k) => k.toLowerCase() === "content-type"
    );
    if (!hasContentType) {
      headers["Content-Type"] = ["application/json"];
    }
    return { bodyStr: JSON.stringify(bodyInit) };
  }

  return { bodyStr: String(bodyInit) };
}

function isProxyEnvelope(obj: unknown): obj is ProxyEnvelope {
  if (obj === null || typeof obj !== "object") {
    return false;
  }
  const candidate = obj as Record<string, unknown>;
  const hasStatus =
    typeof candidate.statusCode === "number" || typeof candidate.status === "number";
  return hasStatus;
}

/**
 * Executes an HTTP request via the Yandex Serverless proxy endpoint, behaving almost like native fetch
 * but bypassing browser origin restrictions.
 */
export async function proxyFetch(
  input: string | URL,
  init?: ProxyRequestInit
): Promise<Result<ProxyResponse, Error>> {
  const targetUrl = typeof input === "string" ? input : input.toString();
  const method = (init?.method || "GET").toUpperCase();
  const headers = normalizeHeaders(init?.headers);
  const { bodyStr, isBase64Encoded } = processBody(init?.body, headers);
  const endpoint = init?.proxyEndpoint || getProxyEndpoint();

  const payload: ProxyRequestBody = {
    method,
    url: targetUrl,
    body: bodyStr,
    isBase64Encoded,
    multiValueHeaders: Object.keys(headers).length > 0 ? headers : undefined,
    impersonate: init?.impersonate,
  };

  const response = await withResult(fetch)(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.error !== null) {
    return err(
      new AggregateError(
        [response.error],
        `failed to make request to proxy endpoint (${endpoint})`
      )
    );
  }

  if (!response.data.ok) {
    return err(
      new Error(
        `proxy endpoint HTTP error! status: ${response.data.status} ${response.data.statusText}`
      )
    );
  }

  const jsonResult = await withResult(() => response.data.json())();
  if (jsonResult.error !== null) {
    return err(
      new AggregateError([jsonResult.error], "proxy response is not valid JSON")
    );
  }

  const data = jsonResult.data;
  if (!isProxyEnvelope(data)) {
    return err(
      new Error(
        `proxy response is not of valid envelope format: ${JSON.stringify(data)}`
      )
    );
  }

  const statusCode = data.statusCode ?? data.status ?? 200;
  const bodyText =
    typeof data.body === "string"
      ? data.body
      : data.body !== undefined
      ? JSON.stringify(data.body)
      : "";

  return ok(createProxyResponse(statusCode, bodyText, data.multiValueHeaders));
}

/**
 * Alias for proxyFetch to allow `import { fetch } from '...'` style usage.
 */
export { proxyFetch as fetch };



/**
 * Legacy proxy call expecting HTTP 200 with JSON body.
 */
export async function proxy200JSON<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
  headers?: { [key: string]: string[] }
): Promise<Result<T, Error>> {
  const fetchRes = await proxyFetch(url, {
    method,
    body: body as BodyInit | Record<string, unknown> | null,
    headers,
  });
  if (fetchRes.error !== null) {
    return err(fetchRes.error);
  }

  if (fetchRes.data.status !== 200) {
    return err(new Error(`fetch HTTP error! status: ${fetchRes.data.status}`));
  }

  const jsonRes = await fetchRes.data.json<T>();
  if (jsonRes.error !== null) {
    return err(new AggregateError([jsonRes.error], "failed to parse response"));
  }

  return ok(jsonRes.data);
}
