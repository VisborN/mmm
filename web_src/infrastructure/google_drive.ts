/* eslint-disable @typescript-eslint/no-explicit-any */
import "ts-error-as-value/lib/globals";

const CLIENT_ID = '26384778878-6ev9883mob866lnecidhqeudl4461pvd.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive';

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

    hasValidToken(): boolean {
        if (this.accessToken) return true;
        const storedToken = localStorage.getItem('gdrive_access_token');
        const expiresAt = localStorage.getItem('gdrive_token_expires_at');
        return !!(storedToken && expiresAt && Date.now() < parseInt(expiresAt, 10));
    }

    async getUserEmail(): Promise<Result<string | null>> {
        if (!this.hasValidToken()) {
            return ok(null);
        }

        const authRes = await this.ensureAuthenticated();
        if (authRes.error) return err(authRes.error);

        const url = 'https://www.googleapis.com/drive/v3/about?fields=user';
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

        return ok(data.data.user?.emailAddress || null);
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
            if (typeof window !== 'undefined' && (window as any).google) {
                this.tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: (response: any): void => {
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
                    },
                    error_callback: (error: any): void => {
                        let errorType = error;
                        if (error && typeof error === 'object') {
                            errorType = error.type || error.message || JSON.stringify(error);
                        }
                        resolve(err(new Error(`Authentication error: ${errorType}. Пожалуйста, отключите блокировщик всплывающих окон.`)));
                    }
                });
                this.tokenClient.requestAccessToken();
            } else {
                resolve(err(new Error('Google Identity Services not initialized')));
            }
        });
    }

    async listFiles(query: string, extraFields?: string[]): Promise<Result<any[]>> {
        const authRes = await this.ensureAuthenticated();
        if (authRes.error) return err(authRes.error);

        let allFiles: any[] = [];
        let pageToken: string | undefined = undefined;

        const fileFields = ['id', 'name', ...(extraFields ?? [])].join(',');
        do {
            let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=1000&fields=nextPageToken,files(${fileFields})`;
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

    async uploadFile(name: string, content: string, mimeType: string, folderId?: string, fileId?: string, appProperties?: Record<string, string>): Promise<Result<{ id: string; createdTime: string }>> {
        const authRes = await this.ensureAuthenticated();
        if (authRes.error) return err(authRes.error);

        const metadata: any = {
            name: name,
            mimeType: mimeType
        };
        if (folderId && !fileId) {
            metadata.parents = [folderId];
        }
        if (appProperties) {
            metadata.appProperties = appProperties;
        }

        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        // Convert the UTF-8 content string to Base64 to prevent the multipart parser from mangling high-bit characters.
        const base64Content = btoa(unescape(encodeURIComponent(content)));

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: ' + mimeType + '; charset=UTF-8\r\n' +
            'Content-Transfer-Encoding: base64\r\n\r\n' +
            base64Content +
            close_delim;

        const method = fileId ? 'PATCH' : 'POST';
        const url = fileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,createdTime`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,createdTime';

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
            
            let errorDetail = response.data.statusText;
            try {
                const errorData = await response.data.json();
                if (errorData && errorData.error && errorData.error.message) {
                    errorDetail += ` - ${errorData.error.message}`;
                } else {
                    errorDetail += ` - ${JSON.stringify(errorData)}`;
                }
            } catch {
                // Ignore json parsing error if the response is not JSON
            }
            
            return err(new Error(`Drive API upload error: ${errorDetail}`));
        }

        const data = await withResult(() => response.data.json())();
        if (data.error) return err(data.error);

        return ok({ id: data.data.id, createdTime: data.data.createdTime });
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
