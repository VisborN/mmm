/* eslint-disable @typescript-eslint/no-explicit-any */
import "ts-error-as-value/lib/globals";
import { get, set } from 'idb-keyval';

/**
 * A utility class to mimic SharedPreferences with JSON support
 * using the idb-keyval library.
 */
export class JsonStore {
  /**
   * Saves a value to IndexedDB.
   * * @param key - The identifier for the data.
   * @param value - Any JSON-serializable object.
   * @param replacer - Optional function to transform nested values (Dart's toEncodable).
   */
  static async setJson<T>(
    key: string,
    value: T,

    replacer?: (this: any, key: string, value: any) => any
  ): Promise<void> {
    // 1. Encode to JSON string (matching your Dart logic)
    const jsonValue = JSON.stringify(value, replacer);

    // 2. Persist to IndexedDB
    await set(key, jsonValue);
  }

  /**
   * Reads a value from IndexedDB and parses it.
   * Throws an Error if the stored value is not valid JSON.
   */

  static async getJson<T = any>(key: string): Promise<Result<T | null, Error>> {
    // 1. Retrieve the string from IndexedDB
    const jsonValueRes = await withResult(get<string>)(key);
    if (jsonValueRes.error !== null) {
      return err(new AggregateError([jsonValueRes.error], `Failed to retrieve key "${key}" from IDB`));
    }

    const jsonValue = jsonValueRes.data;

    // 2. Return null if not found (matching Dart's getJson)
    if (jsonValue === undefined || jsonValue === null) {
      return ok(null);
    }

    // 3. Parse JSON
    const parseRes = withResult(JSON.parse)(jsonValue) as Result<any, Error>;
    if (parseRes.error !== null) {
      return err(new AggregateError([parseRes.error], `FormatException: Invalid JSON text for key "${key}"`));
    }
    return ok(parseRes.data as T);
  }
}