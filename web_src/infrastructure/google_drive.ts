/* eslint-disable @typescript-eslint/no-explicit-any */
import "ts-error-as-value/lib/globals";

const CLIENT_ID = '26384778878-6ev9883mob866lnecidhqeudl4461pvd.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';

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

    private clearAuth(): void {
        this.accessToken = null;
        localStorage.removeItem('gdrive_access_token');
        localStorage.removeItem('gdrive_token_expires_at');
    }

    async ensureAuthenticated(): Promise<Result<string>> {
        if (this.accessToken) {
            return ok(this.accessToken);
        }

        const storedToken = localStorage.getItem('gdrive_access_token');
        const expiresAt = localStorage.getItem('gdrive_token_expires_at');
        if (storedToken && expiresAt && Date.now() < parseInt(expiresAt, 10)) {
            this.accessToken = storedToken;
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
                if (response.expires_in) {
                    localStorage.setItem('gdrive_access_token', response.access_token);
                    localStorage.setItem('gdrive_token_expires_at', (Date.now() + response.expires_in * 1000).toString());
                }
                resolve(ok(this.accessToken!));
            };

            this.tokenClient.requestAccessToken();
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
            if (!response.data.ok) {
                if (response.data.status === 401) this.clearAuth();
                return err(new Error(`Drive API error: ${response.data.statusText}`));
            }

            const data = await withResult(() => response.data.json())();
            if (data.error) return err(data.error);

            if (data.data.files) {
                allFiles = allFiles.concat(data.data.files);
            }
            pageToken = data.data.nextPageToken;
        } while (pageToken);

        return ok(allFiles);
    }

    async listFolders(parentId?: string): Promise<Result<any[]>> {
        const authRes = await this.ensureAuthenticated();
        if (authRes.error) return err(authRes.error);

        let allFolders: any[] = [];
        let pageToken: string | undefined = undefined;

        const parentQuery = parentId ? `'${parentId}' in parents` : "'root' in parents";
        const query = `mimeType = 'application/vnd.google-apps.folder' and ${parentQuery} and trashed = false`;

        do {
            let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=1000&fields=nextPageToken,files(id,name)`;
            if (pageToken) {
                url += `&pageToken=${pageToken}`;
            }

            const response = await withResult(fetch)(url, {
                headers: { Authorization: `Bearer ${this.accessToken}` }
            });

            if (response.error) return err(response.error);
            if (!response.data.ok) {
                if (response.data.status === 401) this.clearAuth();
                return err(new Error(`Drive API error: ${response.data.statusText}`));
            }

            const data = await withResult(() => response.data.json())();
            if (data.error) return err(data.error);

            if (data.data.files) {
                allFolders = allFolders.concat(data.data.files);
            }
            pageToken = data.data.nextPageToken;
        } while (pageToken);

        // Sort folders alphabetically by name
        allFolders.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        return ok(allFolders);
    }

    async uploadFile(name: string, content: string, mimeType: string, folderId?: string, fileId?: string): Promise<Result<string>> {
        const authRes = await this.ensureAuthenticated();
        if (authRes.error) return err(authRes.error);

        const metadata: any = {
            name: name,
            mimeType: mimeType
        };
        if (folderId && !fileId) {
            metadata.parents = [folderId];
        }

        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        // To support unicode correctly in multipart upload, we shouldn't just use string concatenation directly if using fetch with string body.
        // Actually, fetch handles string bodies as UTF-8 automatically.
        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: ' + mimeType + '; charset=UTF-8\r\n\r\n' +
            content +
            close_delim;

        const method = fileId ? 'PATCH' : 'POST';
        const url = fileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        const response = await withResult(fetch)(url, {
            method: method,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}` // without quotes around boundary
            },
            body: multipartRequestBody
        });

        if (response.error) return err(response.error);
        if (!response.data.ok) {
            if (response.data.status === 401) this.clearAuth();
            return err(new Error(`Drive API upload error: ${response.data.statusText}`));
        }

        const data = await withResult(() => response.data.json())();
        if (data.error) return err(data.error);

        return ok(data.data.id);
    }

    async getFileContent(fileId: string): Promise<Result<string>> {
        const authRes = await this.ensureAuthenticated();
        if (authRes.error) return err(authRes.error);

        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const response = await withResult(fetch)(url, {
            headers: { Authorization: `Bearer ${this.accessToken}` }
        });

        if (response.error) return err(response.error);
        if (!response.data.ok) {
            if (response.data.status === 401) this.clearAuth();
            return err(new Error(`Drive API download error: ${response.data.statusText}`));
        }

        const text = await withResult(() => response.data.text())();
        if (text.error) return err(text.error);

        return ok(text.data);
    }

    async deleteFile(fileId: string): Promise<Result<void>> {
        const authRes = await this.ensureAuthenticated();
        if (authRes.error) return err(authRes.error);

        const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
        const response = await withResult(fetch)(url, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${this.accessToken}` }
        });

        if (response.error) return err(response.error);
        if (!response.data.ok) return err(new Error(`Drive API delete error: ${response.data.statusText}`));

        return ok(undefined);
    }
}

export const googleDriveService = new GoogleDriveService();
