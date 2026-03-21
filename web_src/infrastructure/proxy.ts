import "ts-error-as-value/lib/globals";

export interface Response {
  statusCode: number;
  body: string;
  multiValueHeaders?: { [key: string]: string[] };
}

export async function proxy(method: string, url: string, body?: any, headers?: { [key: string]: string[] } ): Promise<Result<Response>> {
  const request: ProxyRequest ={
    method: method,
    url: url,
    body: body !== undefined ? JSON.stringify(body) : null,
    multiValueHeaders: headers,
  };
  const response = await withResult(fetch)("/proxy", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  if (response.error !== null) {
    return err(new AggregateError( [response.error], `failed to make request to proxy`))
  }
  if (!response.data.ok) {
    return err(new Error(`proxy HTTP error! status: ${response.data.status}`));
  }

  // Cast the result to our Response interface
  const data = await withResult(response.data.json)();
  if (data.error !== null) {
    return err(new AggregateError( [data.error],`proxy response isnt json`));
  }
  if (!isResponse(data.data)) {
    return err(new Error( `proxy response isnt of valid format: ${data.data}`));
  }

  return ok(data.data);
}

export async function proxy200JSON(method: string, url: string, body?: any, headers?: { [key: string]: string[] } ): Promise<Result<any>>{
  const response = await proxy(method, url, body, headers);
  if (response.error !== null) {
    return response;
  }
  if (response.data.statusCode !== 200) {
    return err(new Error(`fetch HTTP error! status: ${response.data.statusCode}`));
  }
  const parsedBody = await withResult(JSON.parse)(response.data.body)
  if (parsedBody.error !== null) {
    return err(new AggregateError([parsedBody.error], "failed to parse response"));
  }
  return ok(parsedBody.data)
}

interface ProxyRequest {
  method: string;
  url: string;
  body: string | null;
  isBase64Encoded?: boolean;
  multiValueHeaders?: { [key: string]: string[] };
}

function isResponse(obj: any): obj is Response {
  return typeof obj.statusCode === 'string' &&
    typeof obj.body === 'string' &&
    (
      obj.multiValueHeaders === undefined ||
      typeof obj.multiValueHeaders === 'object' &&
      Object.values(obj).every(value =>
        Array.isArray(value) &&
        value.every(item => typeof item === 'string')
      )
    );
}

