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

    if (loading) return <div style={{ padding: '20px' }}>Loading DB Data...</div>;

    return (
        <div style={{ padding: '20px' }}>
            <button
                onClick={() => window.history.back()}
                style={{ padding: '8px 16px', marginBottom: '20px', cursor: 'pointer' }}
            >
                &larr; Назад
            </button>
            <h2>Database Explorer</h2>
            {Object.keys(dbData).map(storeName => (
                <div key={storeName} style={{ marginBottom: '40px', overflowX: 'auto' }}>
                    <h3>Table: {storeName} ({dbData[storeName].length} rows)</h3>
                    {dbData[storeName].length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr>
                                    {Object.keys(dbData[storeName][0]).map(key => (
                                        <th key={key} style={{ border: '1px solid #ddd', padding: '8px', backgroundColor: '#f2f2f2', textAlign: 'left' }}>
                                            {key}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {dbData[storeName].map((row, idx) => (
                                    <tr key={idx}>
                                        {Object.keys(dbData[storeName][0]).map(key => {
                                            const val = row[key];
                                            return (
                                                <td key={key} style={{ border: '1px solid #ddd', padding: '8px' }}>
                                                    {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p>No rows found.</p>
                    )}
                </div>
            ))}
        </div>
    );
});
