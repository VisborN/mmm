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
  static async setJson(
    key: string,
    value: any,
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
  static async getJson<T = any>(key: string): Promise<T | null> {
    // 1. Retrieve the string from IndexedDB
    const jsonValue = await get<string>(key);

    // 2. Return null if not found (matching Dart's getJson)
    if (jsonValue === undefined || jsonValue === null) {
      return null;
    }

    try {
      // 3. Parse and return
      return JSON.parse(jsonValue) as T;
    } catch (e) {
      throw new Error(`FormatException: Invalid JSON text for key "${key}"`, { cause: e });
    }
  }
}