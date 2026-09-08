import "ts-error-as-value/lib/globals";
import { TinkoffOperation, TinkoffDetails } from '../domain/tinkoff_operation';
import { proxy200JSON } from './proxy';

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

  const response = await proxy200JSON<TinkoffOperationsResponse>('GET', url);
  if (response.error !== null) {
    return err(new AggregateError([response.error], "failed to call operations"));
  }
  const resJson: TinkoffOperationsResponse = response.data; // TODO validate may be
  return ok(resJson);
}
