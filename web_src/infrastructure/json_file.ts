/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type */
/**
 * Asks user to open a file via the browser's file picker and parses it as JSON.
 * Simplified for modern browser environments.
 */

import "ts-error-as-value/lib/globals";

export async function askAndReadJsonFile(): Promise<Result<any, Error>> {
  return new Promise((resolve) => {
    // 1. Create a hidden input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json'; // You can add .svg, .pdf here if needed, but original code expects JSON content

    input.onchange = async (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];

      if (!file) {
        return resolve(err(new Error('UserHaventOpenedFileProperly')));
      }

      // 2. Read file content as string
      const textRes = await withResult(file.text, file)();
      if (textRes.error !== null) {
        return resolve(err(new AggregateError([textRes.error], 'UserHaventOpenedFileProperly')));
      }

      // 3. Parse JSON
      const jsonRes = withResult(JSON.parse)(textRes.data) as Result<any, Error>;
      if (jsonRes.error !== null) {
        return resolve(err(new Error('FormatException: Invalid JSON')));
      }
      
      resolve(ok(jsonRes.data));
    };

    // Handle cancel (note: 'cancel' event isn't supported in all browsers yet)
    input.oncancel = () => {
      resolve(err(new Error('UserHaventOpenedFileProperly')));
    };

    // 4. Trigger the file picker
    input.click();
  });
}