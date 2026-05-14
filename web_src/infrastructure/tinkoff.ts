/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import "ts-error-as-value/lib/globals";
import { TinkoffOperation, TinkoffDetails } from '../domain/tinkoff_operation';
import { proxy, proxy200JSON } from './proxy';

/**
 * Interface representing the Tinkoff API response for operations.
 */
export interface TinkoffOperationsResponse {
  resultCode?: string;
  payload?: TinkoffOperation[];
  trackingId?: string;
  details?: TinkoffDetails;
}

const BASE_URL = 'https://www.tinkoff.ru/api/common/v1';

/**
 * Performs a signup POST request.
 */
export async function signupPost({
  wuid,
  password,
  phone,
  session,
  origin,
}: {
  wuid: string;
  password?: string;
  phone?: string;
  session: string;
  origin: string;
}): Promise<Result<any>> {
  const signUpBody: Record<string, string> = {
    wuid: wuid,
    entrypoint_type: "context",
    device_type: "desktop",
    form_view_mode: "desktop",
  };

  if (password) signUpBody["password"] = password;
  if (phone) signUpBody["phone"] = phone;

  const url = `${BASE_URL}/sign_up?origin=${origin}&sessionid=${session}&wuid=${wuid}`;

  const response = await proxy200JSON('POST', url, (new URLSearchParams(signUpBody).toString()));
  if (response.error !== null) {
    return err(new AggregateError([response.error], "failed to call sign_up"));
  }

  return response;
}

/**
 * Level up the current session.
 */
export async function levelUp(origin: string, session: string): Promise<Result<any>> {
  const url = `${BASE_URL}/level_up?origin=${origin}&sessionid=${session}`;
  const response = await proxy200JSON('GET', url);
  if (response.error !== null) {
    return err(new AggregateError([response.error], "failed to call level_up"));
  }
  return response;
}

/**
 * Fetches operations for a specific time range.
 */
export async function getOperations({
  session,
  start,
  end,
}: {
  session: string;
  start: Date;
  end: Date;
}): Promise<Result<TinkoffOperationsResponse>> {
  const url = `${BASE_URL}/operations?end=${end.getTime()}&start=${start.getTime()}&sessionid=${session}`;

  const response = await proxy200JSON('GET', url);
  if (response.error !== null) {
    return err(new AggregateError([response.error], "failed to call operations"));
  }
  const resJson: TinkoffOperationsResponse = await response.data; // TODO validate may be
  return ok(resJson);
}

/**
 * Confirms an operation (usually SMS OTP).
 */
export async function confirmPost({
  wuid,
  session,
  origin,
  operationTicket,
  code,
}: {
  wuid: string;
  session: string;
  origin: string;
  operationTicket: string;
  code: string;
}): Promise<Result<any>> {
  const body = {
    initialOperationTicket: operationTicket,
    initialOperation: "sign_up",
    confirmationData: JSON.stringify({ SMSBYID: code }),
  };

  const url = `${BASE_URL}/confirm?origin=${origin}&sessionid=${session}&wuid=${wuid}`;

  const response = await proxy200JSON('POST', url, (new URLSearchParams(body).toString()));
  if (response.error !== null) {
    return err(new AggregateError([response.error], "failed to call confirm"));
  }
  return response;
}

/**
 * Gets basic web user info.
 */
export async function getWebUser(): Promise<Result<any>> {
  const response = await proxy200JSON('GET', `${BASE_URL}/webuser`);
  if (response.error !== null) {
    return err(new AggregateError([response.error], "failed to call webuser"));
  }
  return response;
}

/**
 * Checks the status of the current session.
 */
export async function sessionStatus(session: string, origin: string): Promise<Result<any>> {
  const url = `${BASE_URL}/session_status?origin=${origin}&sessionid=${session}`;
  const response = await proxy200JSON('GET', url);
  if (response.error !== null) {
    return err(new AggregateError([response.error], "failed to call session_status"));
  }
  return response;
}

/**
 * Initializes or retrieves a session.
 */
export async function getSession({
  origin,
  wuid,
  oldSession,
}: {
  origin: string;
  wuid: string;
  oldSession?: string;
}): Promise<Result<any>> {
  let url = `${BASE_URL}/session?origin=${origin}&wuid=${wuid}`;
  if (oldSession) {
    url += `&${oldSession}`;
  }

  const response = await proxy200JSON('GET', url);
  if (response.error !== null) {
    return err(new AggregateError([response.error], "failed to call session_status"));
  }
  return response;
}