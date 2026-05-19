import "ts-error-as-value/lib/globals";
import { Transaction } from "./types";
import { googleDriveService } from "../infrastructure/google_drive";

export class GoogleSyncService {
    async exportToGoogleDrive(transactions: Transaction[], folderId?: string): Promise<Result<void, Error>> {
        const groups: Record<string, Transaction[]> = {};
        for (const t of transactions) {
            const month = t.date.substring(0, 7); // YYYY-MM
            const key = `MMM - ${t.accountName} - ${month}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(t);
        }

        for (const [name, txs] of Object.entries(groups)) {
            const escapedName = name.replace(/'/g, "\\'");
            let query = `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.spreadsheet'`;
            if (folderId) {
                query += ` and '${folderId}' in parents`;
            }
            const filesRes = await googleDriveService.listFiles(query);
            let spreadsheetId: string;

            if (filesRes.error) {
                return err(filesRes.error);
            }

            if (filesRes.data.length > 0) {
                spreadsheetId = filesRes.data[0].id;
            } else {
                const createRes = await googleDriveService.createSpreadsheet(name, folderId);
                if (createRes.error) {
                    return err(createRes.error);
                }
                spreadsheetId = createRes.data;
            }

            const values = [
                ['id', 'date', 'amountRubles', 'amountAccountCurrency', 'accountName', 'category', 'description', 'type', 'transferReceiveAccountName', 'transferReceiveAmountAccountCurrency'],
                ...txs.map(t => [
                    t.id, t.date, t.amountRubles, t.amountAccountCurrency, t.accountName, t.category, t.description, t.type, t.transferReceiveAccountName, t.transferReceiveAmountAccountCurrency
                ])
            ];

            const updateRes = await googleDriveService.updateSpreadsheetValues(spreadsheetId, values);
            if (updateRes.error) {
                return err(updateRes.error);
            }
        }

        return ok(undefined);
    }

    async importFromGoogleDrive(folderId?: string): Promise<Result<Transaction[], Error>> {
        let query = "name contains 'MMM - ' and mimeType = 'application/vnd.google-apps.spreadsheet'";
        if (folderId) {
            query += ` and '${folderId}' in parents`;
        }
        const filesRes = await googleDriveService.listFiles(query);
        if (filesRes.error) {
            return err(filesRes.error);
        }

        const allTransactions: Transaction[] = [];
        for (const file of filesRes.data) {
            const valuesRes = await googleDriveService.getSpreadsheetValues(file.id);
            if (valuesRes.error) {
                return err(valuesRes.error);
            }

            const values = valuesRes.data;
            if (!values || values.length <= 1) continue;

            const headers = values[0];
            const rows = values.slice(1);

            for (const row of rows) {
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

                allTransactions.push(transaction);
            }
        }

        return ok(allTransactions);
    }
}

export const googleSyncService = new GoogleSyncService();
