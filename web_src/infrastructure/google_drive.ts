/* eslint-disable @typescript-eslint/no-explicit-any */
import "ts-error-as-value/lib/globals";

const CLIENT_ID = '26384778878-6ev9883mob866lnecidhqeudl4461pvd.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets';

export class GoogleDriveService {
    private accessToken: string | null = null;
    private tokenClient: any = null;

    constructor() {
        // Initialization is delayed until ensureAuthenticated is called
    }

    private initTokenClient(): void {
        if (typeof window !== 'undefined' && (window as any).google) {
            this.tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (response: any): void => {
                    if (response.error !== undefined) {
                        console.error('GIS error:', response);
                        return;
                    }
                    this.accessToken = response.access_token;
                },
            });
        }
    }

    async ensureAuthenticated(): Promise<Result<string>> {
        if (this.accessToken) {
            return ok(this.accessToken);
        }

        return new Promise((resolve) => {
            if (!this.tokenClient) {
                this.initTokenClient();
            }

            if (!this.tokenClient) {
                resolve(err(new Error('Google Identity Services not initialized')));
                return;
            }

            const originalCallback = this.tokenClient.callback;
            this.tokenClient.callback = (response: any): void => {
                this.tokenClient.callback = originalCallback;
                if (response.error !== undefined) {
                    resolve(err(new Error(`Authentication failed: ${response.error}`)));
                    return;
                }
                this.accessToken = response.access_token;
                resolve(ok(this.accessToken!));
            };

            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    async listFiles(query: string): Promise<Result<any[]>> {
        const authRes = await this.ensureAuthenticated();
        if (authRes.error) return err(authRes.error);

        let allFiles: any[] = [];
        let pageToken: string | undefined = undefined;

        do {
            let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=1000&fields=nextPageToken,files(id,name)`;
            if (pageToken) {
                url += `&pageToken=${pageToken}`;
            }

            const response = await withResult(fetch)(url, {
                headers: { Authorization: `Bearer ${this.accessToken}` }
            });

            if (response.error) return err(response.error);
            if (!response.data.ok) return err(new Error(`Drive API error: ${response.data.statusText}`));

            const data = await withResult(response.data.json)();
            if (data.error) return err(data.error);

            if (data.data.files) {
                allFiles = allFiles.concat(data.data.files);
            }
            pageToken = data.data.nextPageToken;
        } while (pageToken);

        return ok(allFiles);
    }

    async createSpreadsheet(name: string): Promise<Result<string>> {
        const authRes = await this.ensureAuthenticated();
        if (authRes.error) return err(authRes.error);

        const url = 'https://sheets.googleapis.com/v4/spreadsheets';
        const response = await withResult(fetch)(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                properties: { title: name }
            })
        });

        if (response.error) return err(response.error);
        if (!response.data.ok) return err(new Error(`Sheets API error: ${response.data.statusText}`));

        const data = await withResult(response.data.json)();
        if (data.error) return err(data.error);

        return ok(data.data.spreadsheetId);
    }

    async updateSpreadsheetValues(spreadsheetId: string, values: any[][]): Promise<Result<void>> {
        const authRes = await this.ensureAuthenticated();
        if (authRes.error) return err(authRes.error);

        // First, clear the sheet
        const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:Z1000:clear`;
        await fetch(clearUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.accessToken}` }
        });

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=RAW`;
        const response = await withResult(fetch)(url, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values })
        });

        if (response.error) return err(response.error);
        if (!response.data.ok) {
            const errorData = await response.data.json();
            return err(new Error(`Sheets API update error: ${JSON.stringify(errorData)}`));
        }

        return ok(undefined);
    }

    async getSpreadsheetValues(spreadsheetId: string): Promise<Result<any[][]>> {
        const authRes = await this.ensureAuthenticated();
        if (authRes.error) return err(authRes.error);

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:Z1000`;
        const response = await withResult(fetch)(url, {
            headers: { Authorization: `Bearer ${this.accessToken}` }
        });

        if (response.error) return err(response.error);
        if (!response.data.ok) return err(new Error(`Sheets API read error: ${response.data.statusText}`));

        const data = await withResult(response.data.json)();
        if (data.error) return err(data.error);

        return ok(data.data.values);
    }
}

export const googleDriveService = new GoogleDriveService();
