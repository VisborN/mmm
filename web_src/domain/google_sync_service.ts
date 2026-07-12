import "ts-error-as-value/lib/globals";
import { Transaction } from "./types";
import { googleDriveService } from "../infrastructure/google_drive";
import { acquireLock, releaseLock } from "../infrastructure/google_drive_lock";
import Papa from "papaparse";

async function withLocalLock<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
        return new Promise((resolve) => {
            navigator.locks.request("mmm_sync", async () => {
                resolve(await fn());
            });
        });
    }
    return fn();
}

export class GoogleSyncService {
    async getUserEmail(): Promise<Result<string | null, Error>> {
        return googleDriveService.getUserEmail();
    }

    async exportToGoogleDrive(transactions: Transaction[], folderId?: string, onProgress?: (progress: string) => void): Promise<Result<void, Error>> {
        return withLocalLock(async () => {
            if (!transactions || transactions.length === 0) {
                return err(new Error('Нет операций для экспорта'));
            }

            if (onProgress) onProgress('Получение блокировки синхронизации...');
            const lockRes = await acquireLock("export", folderId, onProgress);
            if (lockRes.error) return err(new AggregateError([lockRes.error], "failed to acquire sync lock for export"));

            const lockFileId = lockRes.data;

            try {
                const groups: Record<string, Transaction[]> = {};
                for (const t of transactions) {
                    const month = t.date.substring(0, 7); // YYYY-MM
                    const key = `MMM - ${t.accountName} - ${month}.csv`;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(t);
                }

                const entries = Object.entries(groups);
                let completed = 0;

                const uploadPromises = entries.map(async ([name, txs]) => {
                    const escapedName = name.replace(/'/g, "\\'");
                    let query = `name = '${escapedName}' and mimeType = 'text/csv' and trashed = false`;
                    if (folderId) {
                        query += ` and '${folderId}' in parents`;
                    }
                    const filesRes = await googleDriveService.listFiles(query);
                    let fileId: string | undefined;

                    if (filesRes.error) return err(filesRes.error);

                    if (filesRes.data.length > 0) {
                        fileId = filesRes.data[0].id;
                    }

                    const csvContent = "\uFEFF" + Papa.unparse(txs);

                    const uploadRes = await googleDriveService.uploadFile(name, csvContent, 'text/csv', folderId, fileId);
                    if (uploadRes.error) return err(uploadRes.error);

                    completed++;
                    if (onProgress) onProgress(`Загружено ${completed} из ${entries.length} файлов...`);

                    return ok(undefined);
                });

                const results = await Promise.all(uploadPromises);
                for (const res of results) {
                    if (res.error) return err(res.error);
                }

                return ok(undefined);
            } finally {
                await releaseLock(lockFileId);
            }
        });
    }

    async importFromGoogleDrive(folderId?: string, onProgress?: (progress: string) => void): Promise<Result<Transaction[], Error>> {
        return withLocalLock(async () => {
            if (onProgress) onProgress('Получение блокировки синхронизации...');
            const lockRes = await acquireLock("import", folderId, onProgress);
            if (lockRes.error) return err(new AggregateError([lockRes.error], "failed to acquire sync lock for import"));

            const lockFileId = lockRes.data;

            try {
                if (onProgress) onProgress('Поиск CSV файлов...');
                let query = "name contains 'MMM - ' and mimeType = 'text/csv' and trashed = false";
                if (folderId) {
                    query += ` and '${folderId}' in parents`;
                }
                const filesRes = await googleDriveService.listFiles(query);
                if (filesRes.error) return err(filesRes.error);

                const allTransactions: Transaction[] = [];
                const files = filesRes.data;
                let completed = 0;
                
                const fetchPromises = files.map(async (file) => {
                    const contentRes = await googleDriveService.getFileContent(file.id);
                    if (contentRes.error) return err(contentRes.error);

                    const parsed = Papa.parse(contentRes.data, { header: true, dynamicTyping: true, skipEmptyLines: true });
                    
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const fileTransactions: Transaction[] = parsed.data.map((t: any) => ({
                        id: typeof t.id === 'number' ? t.id : parseInt(t.id as unknown as string, 10) || 0,
                        uuid: t.uuid || '',
                        date: t.date || '',
                        amountRubles: typeof t.amountRubles === 'number' ? t.amountRubles : parseFloat(t.amountRubles as unknown as string) || 0,
                        amountAccountCurrency: String(t.amountAccountCurrency || '0'),
                        accountName: t.accountName || '',
                        category: t.category || '',
                        description: t.description || '',
                        type: t.type || 'withdraw',
                        transferReceiveAccountName: t.transferReceiveAccountName || null,
                        transferReceiveAmountAccountCurrency: t.transferReceiveAmountAccountCurrency !== null && t.transferReceiveAmountAccountCurrency !== undefined ? String(t.transferReceiveAmountAccountCurrency) : null,
                    }));

                    completed++;
                    if (onProgress) onProgress(`Скачано ${completed} из ${files.length} файлов...`);

                    return ok(fileTransactions);
                });

                const results = await Promise.all(fetchPromises);
                for (const res of results) {
                    if (res.error) return err(res.error);
                    allTransactions.push(...res.data);
                }

                // Deduplicate transactions by uuid if they are present
                const seenUuids = new Set<string>();
                const uniqueTransactions: Transaction[] = [];
                for (const t of allTransactions) {
                    if (t.uuid) {
                        if (seenUuids.has(t.uuid)) {
                            continue;
                        }
                        seenUuids.add(t.uuid);
                    }
                    uniqueTransactions.push(t);
                }

                return ok(uniqueTransactions);
            } finally {
                await releaseLock(lockFileId);
            }
        });
    }
}

export const googleSyncService = new GoogleSyncService();