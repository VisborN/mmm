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
  const rawData = await JsonStore.getJson<any[]>(SAVE_KEY) ?? [];

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
export async function readFromFile(): Promise<Operation[]> {
  try {
    const fileContent = await askAndReadJsonFile();
    const data = Array.isArray(fileContent) ? fileContent : [];

    return data.map((e) => reviveOperation(e));
  } catch (error) {
    console.error("Failed to read file:", error);
    return [];
  }
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