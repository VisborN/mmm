/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type */
/**
 * Asks user to open a file via the browser's file picker and parses it as JSON.
 * Simplified for modern browser environments.
 */

export async function askAndReadJsonFile(): Promise<any> {
  return new Promise((resolve, reject) => {
    // 1. Create a hidden input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json'; // You can add .svg, .pdf here if needed, but original code expects JSON content

    input.onchange = async (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];

      if (!file) {
        return reject(new Error('UserHaventOpenedFileProperly'));
      }

      try {
        // 2. Read file content as string
        const text = await file.text();

        // 3. Parse JSON
        const data = JSON.parse(text);
        resolve(data);
      } catch (e) {
        if (e instanceof SyntaxError) {
          reject(new Error('FormatException: Invalid JSON'));
        } else {
          reject(new Error('UserHaventOpenedFileProperly'));
        }
      }
    };

    // Handle cancel (note: 'cancel' event isn't supported in all browsers yet)
    input.oncancel = () => {
      reject(new Error('UserHaventOpenedFileProperly'));
    };

    // 4. Trigger the file picker
    input.click();
  });
}