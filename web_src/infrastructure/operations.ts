/* eslint-disable @typescript-eslint/no-explicit-any */
import { JsonStore } from './json_store'; // The idb-keyval class from before
import { Operation } from '../domain/operation';
import { askAndReadJsonFile } from './json_file';

const SAVE_KEY = 'localOperations';

/**
 * Reads operations from IndexedDB.
 * Equivalent to readLocal() in Dart.
 */
export async function readLocal(): Promise<Operation[]> {
  // getJson returns null if not found, so we default to an empty array
  const rawDataRes = await JsonStore.getJson<any[]>(SAVE_KEY);
  const rawData = rawDataRes.error ? [] : (rawDataRes.data ?? []);

  // In TS, if the stored JSON matches the interface structure,
  // we cast it. Note: Date strings need to be converted back to Date objects.
  return rawData.map((e) => reviveOperation(e));
}

/**
 * Saves operations to IndexedDB.
 * Equivalent to writeLocal() in Dart.
 */
export async function writeLocal(data: Operation[]): Promise<void> {
  await JsonStore.setJson(SAVE_KEY, data);
}

/**
 * Prompts user for a file and parses it into Operation objects.
 * Equivalent to readFromFile() in Dart.
 */
export async function readFromFile(): Promise<Result<Operation[], Error>> {
  const fileContentRes = await askAndReadJsonFile();
  if (fileContentRes.error !== null) {
    return err(new AggregateError([fileContentRes.error], "Failed to read file"));
  }
  
  const data = Array.isArray(fileContentRes.data) ? fileContentRes.data : [];
  return ok(data.map((e) => reviveOperation(e)));
}

/**
 * Helper to "revive" JSON data.
 * JSON.parse turns Dates into strings, so we must turn them back into Date objects.
 */
function reviveOperation(data: any): Operation {
  return {
    ...data,
    time: new Date(data.time), // Ensure the string timestamp becomes a Date object
  };
}