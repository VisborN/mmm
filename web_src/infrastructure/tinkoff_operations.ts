import { JsonStore } from './json_store';
import { TinkoffOperation } from '../domain/tinkoff_operation';
import { askAndReadJsonFile } from './json_file';

const SAVE_KEY = 'localTinkoffOperations';

/**
 * Reads Tinkoff operations from IndexedDB.
 */
export async function readLocal(): Promise<TinkoffOperation[]> {
  // Retrieve raw array from IndexedDB
  const rawData = await JsonStore.getJson<any[]>(SAVE_KEY);

  // Ensure we return an array. Since TinkoffOperation uses
  // milliseconds (number), no special Date object conversion is
  // required unless you want to wrap it in a class.
  return Array.isArray(rawData) ? (rawData as TinkoffOperation[]) : [];
}

/**
 * Persists Tinkoff operations to IndexedDB.
 */
export async function writeLocal(data: TinkoffOperation[]): Promise<void> {
  await JsonStore.setJson(SAVE_KEY, data);
}

/**
 * Opens file picker and parses results into TinkoffOperation objects.
 */
export async function readFromFile(): Promise<TinkoffOperation[]> {
  try {
    const fileContent = await askAndReadJsonFile();

    // Fallback to empty list if content is null or not an array
    const data = Array.isArray(fileContent) ? fileContent : [];

    return data as TinkoffOperation[];
  } catch (error) {
    // Mimics the 'UserHaventOpenedFileProperly' or 'FormatException' catch
    console.warn("Tinkoff file read failed:", error);
    return [];
  }
}