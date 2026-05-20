import "ts-error-as-value/lib/globals";
import { Transaction } from "./types";
import { googleDriveService } from "../infrastructure/google_drive";

function encodeCSV(headers: string[], rows: unknown[][]): string {
    const escape = (val: unknown): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const headerRow = headers.map(escape).join(',');
    const dataRows = rows.map(row => row.map(escape).join(','));
    return [headerRow, ...dataRows].join('\n');
}

function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    currentCell += '"';
                    i++; // skip escaped quote
                } else {
                    inQuotes = false;
                }
            } else {
                currentCell += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentCell);
                currentCell = '';
            } else if (char === '\n' || char === '\r') {
                currentRow.push(currentCell);
                rows.push(currentRow);
                currentRow = [];
                currentCell = '';
                if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
                    i++; // skip \r\n
                }
            } else {
                currentCell += char;
            }
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }
    return rows;
}

export class GoogleSyncService {
    async exportToGoogleDrive(transactions: Transaction[], folderId?: string): Promise<Result<void, Error>> {
        const groups: Record<string, Transaction[]> = {};
        for (const t of transactions) {
            const month = t.date.substring(0, 7); // YYYY-MM
            const key = `MMM - ${t.accountName} - ${month}.csv`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(t);
        }

        // We can execute uploads in parallel for even more speed
        const uploadPromises = Object.entries(groups).map(async ([name, txs]) => {
            const escapedName = name.replace(/'/g, "\\'");
            let query = `name = '${escapedName}' and mimeType = 'text/csv'`;
            if (folderId) {
                query += ` and '${folderId}' in parents`;
            }
            const filesRes = await googleDriveService.listFiles(query);
            let fileId: string | undefined;

            if (filesRes.error) {
                return err(filesRes.error);
            }

            if (filesRes.data.length > 0) {
                fileId = filesRes.data[0].id;
            }

            const headers = ['id', 'date', 'amountRubles', 'amountAccountCurrency', 'accountName', 'category', 'description', 'type', 'transferReceiveAccountName', 'transferReceiveAmountAccountCurrency'];
            const rows = txs.map(t => [
                t.id, t.date, t.amountRubles, t.amountAccountCurrency, t.accountName, t.category, t.description, t.type, t.transferReceiveAccountName, t.transferReceiveAmountAccountCurrency
            ]);
            
            const csvContent = encodeCSV(headers, rows);

            const uploadRes = await googleDriveService.uploadFile(name, csvContent, 'text/csv', folderId, fileId);
            if (uploadRes.error) {
                return err(uploadRes.error);
            }

            return ok(undefined);
        });

        const results = await Promise.all(uploadPromises);
        for (const res of results) {
            if (res.error) {
                return err(res.error);
            }
        }

        return ok(undefined);
    }

    async importFromGoogleDrive(folderId?: string): Promise<Result<Transaction[], Error>> {
        let query = "name contains 'MMM - ' and mimeType = 'text/csv'";
        if (folderId) {
            query += ` and '${folderId}' in parents`;
        }
        const filesRes = await googleDriveService.listFiles(query);
        if (filesRes.error) {
            return err(filesRes.error);
        }

        const allTransactions: Transaction[] = [];
        
        const fetchPromises = filesRes.data.map(async (file) => {
            const contentRes = await googleDriveService.getFileContent(file.id);
            if (contentRes.error) {
                return err(contentRes.error);
            }

            const values = parseCSV(contentRes.data);
            if (!values || values.length <= 1) return ok([] as Transaction[]);

            const headers = values[0];
            const rows = values.slice(1);
            const fileTransactions: Transaction[] = [];

            for (const row of rows) {
                // Skip empty rows
                if (row.length === 1 && row[0] === '') continue;

                const t = headers.reduce((acc, header, index) => {
                    const val = row[index];
                    
                    if (val === 'null' || val === undefined || val === '') {
                        return { ...acc, [header]: null };
                    }

                    if (header === 'amountRubles') {
                        return { ...acc, [header]: parseFloat(val) };
                    } else if (header === 'id') {
                        return { ...acc, [header]: parseInt(val, 10) };
                    } else {
                        return { ...acc, [header]: val };
                    }
                }, {} as Partial<Transaction>);
                
                // Ensure correct types according to Transaction interface
                const transaction: Transaction = {
                    id: typeof t.id === 'number' ? t.id : parseInt(t.id as unknown as string, 10) || 0,
                    date: t.date || '',
                    amountRubles: typeof t.amountRubles === 'number' ? t.amountRubles : parseFloat(t.amountRubles as unknown as string) || 0,
                    amountAccountCurrency: t.amountAccountCurrency || '0',
                    accountName: t.accountName || '',
                    category: t.category || '',
                    description: t.description || '',
                    type: t.type || 'withdraw',
                    transferReceiveAccountName: t.transferReceiveAccountName || null,
                    transferReceiveAmountAccountCurrency: t.transferReceiveAmountAccountCurrency || null,
                };

                fileTransactions.push(transaction);
            }
            return ok(fileTransactions);
        });

        const results = await Promise.all(fetchPromises);
        for (const res of results) {
            if (res.error) {
                return err(res.error);
            }
            allTransactions.push(...res.data);
        }

        return ok(allTransactions);
    }
}

export const googleSyncService = new GoogleSyncService();
