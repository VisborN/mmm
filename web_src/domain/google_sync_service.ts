import "ts-error-as-value/lib/globals";
import { Transaction } from "./types";
import { googleDriveService } from "../infrastructure/google_drive";
import Papa from "papaparse";

export class GoogleSyncService {
    async exportToGoogleDrive(transactions: Transaction[], folderId?: string, onProgress?: (progress: string) => void): Promise<Result<void, Error>> {
        if (onProgress) onProgress('Удаление старых файлов (Spreadsheets)...');
        await this.deleteOldGSheets(folderId);

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
            let query = `name = '${escapedName}' and mimeType = 'text/csv'`;
            if (folderId) {
                query += ` and '${folderId}' in parents`;
            }
            const filesRes = await googleDriveService.listFiles(query);
            let fileId: string | undefined;

            if (filesRes.error) return err(filesRes.error);

            if (filesRes.data.length > 0) {
                fileId = filesRes.data[0].id;
            }

            const csvContent = Papa.unparse(txs);

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
    }

    async importFromGoogleDrive(folderId?: string, onProgress?: (progress: string) => void): Promise<Result<Transaction[], Error>> {
        if (onProgress) onProgress('Поиск CSV файлов...');
        let query = "name contains 'MMM - ' and mimeType = 'text/csv'";
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

        return ok(allTransactions);
    }

    async deleteOldGSheets(folderId?: string): Promise<void> {
        let query = "name contains 'MMM - ' and mimeType = 'application/vnd.google-apps.spreadsheet'";
        if (folderId) {
            query += ` and '${folderId}' in parents`;
        }
        const filesRes = await googleDriveService.listFiles(query);
        if (filesRes.error) return;

        const deletePromises = filesRes.data.map(file => googleDriveService.deleteFile(file.id));
        await Promise.all(deletePromises);
    }
}

export const googleSyncService = new GoogleSyncService();