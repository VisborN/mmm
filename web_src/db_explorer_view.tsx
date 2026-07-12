import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getDB } from './infrastructure/db';
import "ts-error-as-value/lib/globals";

type DbRow = Record<string, unknown>;

export const DatabaseExplorer = observer(() => {
    const [dbData, setDbData] = useState<Record<string, DbRow[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            const dbRes = await withResult(getDB)();
            if (dbRes.error !== null) {
                console.error('Failed to load database:', dbRes.error);
                setLoading(false);
                return;
            }

            const db = dbRes.data;
            const storeNames = db.objectStoreNames;
            const allData: Record<string, DbRow[]> = {};

            for (let i = 0; i < storeNames.length; i++) {
                const storeName = storeNames[i];
                const res = await withResult(db.getAll, db)(storeName);
                if (!res.error) {
                    allData[storeName] = res.data as unknown as DbRow[];
                }
            }

            setDbData(allData);
            setLoading(false);
        };

        loadData();
    }, []);

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                <div style={{ color: 'var(--text-secondary)' }}>Loading DB Data...</div>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px' }}>
            <h2 style={{ marginBottom: '24px', fontSize: '20px' }}>Database Explorer</h2>
            {Object.keys(dbData).map(storeName => (
                <div key={storeName} className="settings-card" style={{ overflowX: 'auto' }}>
                    <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Table: {storeName} ({dbData[storeName].length} rows)</h3>
                    {dbData[storeName].length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', marginTop: '16px' }}>
                            <thead>
                                <tr>
                                    {Object.keys(dbData[storeName][0]).map(key => (
                                        <th key={key} style={{ borderBottom: '2px solid var(--border-color)', padding: '12px 8px', textAlign: 'left', color: 'var(--text-secondary)' }}>
                                            {key}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {dbData[storeName].map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        {Object.keys(dbData[storeName][0]).map(key => {
                                            const val = row[key];
                                            return (
                                                <td key={key} style={{ padding: '12px 8px' }}>
                                                    {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>No rows found.</p>
                    )}
                </div>
            ))}
        </div>
    );
});
