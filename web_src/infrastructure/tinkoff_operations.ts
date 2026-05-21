/* eslint-disable @typescript-eslint/no-explicit-any */
import "ts-error-as-value/lib/globals";
import { TinkoffOperation } from '../domain/tinkoff_operation';
import { JsonStore } from './json_store';
import { askAndReadJsonFile } from './json_file';

const SAVE_KEY = 'localTinkoffOperations';

/**
 * Loads Tinkoff operations from IndexedDB.
 */
export async function readLocal(): Promise<TinkoffOperation[]> {
  const rawDataRes = await JsonStore.getJson<any[]>(SAVE_KEY);
  const rawData = rawDataRes.error ? null : rawDataRes.data;

  // Since Tinkoff operations use standard JSON-compatible fields like
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
export async function readFromFile(): Promise<Result<TinkoffOperation[], Error>> {
  const fileContentRes = await askAndReadJsonFile();
  if (fileContentRes.error !== null) {
    return err(new AggregateError([fileContentRes.error], "Tinkoff file read failed"));
  }

  // Fallback to empty list if content is null or not an array
  const data = Array.isArray(fileContentRes.data) ? fileContentRes.data : [];

  return ok(data as TinkoffOperation[]);
}