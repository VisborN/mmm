import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { getDB } from './infrastructure/db';

export const DatabaseExplorer = observer(() => {
    const [dbData, setDbData] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const db = await getDB();
                const storeNames = db.objectStoreNames;
                const allData: Record<string, any[]> = {};

                for (let i = 0; i < storeNames.length; i++) {
                    const storeName = storeNames[i];
                    allData[storeName] = await db.getAll(storeName);
                }

                setDbData(allData);
            } catch (err) {
                console.error("Failed to load DB data", err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    if (loading) return <div style={{ padding: '20px' }}>Loading DB Data...</div>;

    return (
        <div style={{ padding: '20px' }}>
            <button
                onClick={() => store.setView('settings')}
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
