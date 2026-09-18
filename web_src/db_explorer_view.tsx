import React, { useCallback, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { openDB } from 'idb';
import "ts-error-as-value/lib/globals";

type DbRow = Record<string, unknown>;

interface TableInfo {
    storeName: string;
    keyPath: string | string[] | null;
    autoIncrement: boolean;
    columns: string[];
    rows: DbRow[];
}

interface DatabaseInfo {
    name: string;
    version: number;
    tables: TableInfo[];
    error?: string;
}

function formatKeyPath(keyPath: string | string[] | null): string {
    if (keyPath === null) return 'out-of-line';
    if (Array.isArray(keyPath)) return `[${keyPath.join(', ')}]`;
    return String(keyPath);
}

function sortColumns(columns: string[]): string[] {
    const priority = ['_key', 'uuid', 'id', 'name', 'date', 'amount', 'currency', 'accountCurrency', 'exchangeRate', 'type', 'category', 'member', 'comment'];
    return [...columns].sort((a, b) => {
        const indexA = priority.indexOf(a);
        const indexB = priority.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
    });
}

function renderCellValue(val: unknown): React.ReactNode {
    if (val === null) return <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>null</span>;
    if (val === undefined) return <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>undefined</span>;
    if (typeof val === 'boolean') return <code>{String(val)}</code>;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') {
        return (
            <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '180px', overflowY: 'auto' }}>
                {JSON.stringify(val, null, 2)}
            </pre>
        );
    }
    const strVal = String(val);
    if ((strVal.startsWith('{') && strVal.endsWith('}')) || (strVal.startsWith('[') && strVal.endsWith(']'))) {
        try {
            const parsed = JSON.parse(strVal);
            return (
                <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '180px', overflowY: 'auto' }}>
                    {JSON.stringify(parsed, null, 2)}
                </pre>
            );
        } catch {
            // not valid JSON, fall through
        }
    }
    return strVal;
}

async function loadAllDatabases(): Promise<DatabaseInfo[]> {
    const dbTargets: { name: string; version?: number }[] = [];
    const seen = new Set<string>();

    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
        const listRes = await withResult(indexedDB.databases, indexedDB)();
        if (listRes.error === null && Array.isArray(listRes.data)) {
            for (const info of listRes.data) {
                if (info.name && !seen.has(info.name)) {
                    seen.add(info.name);
                    dbTargets.push({ name: info.name, version: info.version });
                }
            }
        }
    }

    // Fallback if databases() is unsupported or returned no entries
    const defaultDbs = ['money-management-app', 'keyval-store'];
    if (dbTargets.length === 0) {
        for (const name of defaultDbs) {
            if (!seen.has(name)) {
                seen.add(name);
                dbTargets.push({ name });
            }
        }
    }

    const results: DatabaseInfo[] = [];

    for (const target of dbTargets) {
        const dbRes = await withResult(openDB)(target.name);
        if (dbRes.error !== null) {
            console.error(`Failed to open database "${target.name}":`, dbRes.error);
            results.push({
                name: target.name,
                version: target.version ?? 0,
                tables: [],
                error: String(dbRes.error.message || dbRes.error)
            });
            continue;
        }

        const db = dbRes.data;
        const storeNames = Array.from(db.objectStoreNames);
        const tables: TableInfo[] = [];

        for (const storeName of storeNames) {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const keyPath = store.keyPath;
            const autoIncrement = store.autoIncrement;

            const [keysRes, valuesRes] = await Promise.all([
                withResult(store.getAllKeys, store)(),
                withResult(store.getAll, store)()
            ]);

            await tx.done;

            if (keysRes.error !== null || valuesRes.error !== null) {
                console.error(`Failed to read store "${storeName}" in DB "${target.name}":`, keysRes.error || valuesRes.error);
                continue;
            }

            const keys = keysRes.data;
            const values = valuesRes.data;
            const rows: DbRow[] = [];
            const columnSet = new Set<string>();

            const hasOutOfLineKey = keyPath === null || (Array.isArray(keyPath) && keyPath.length === 0);

            if (hasOutOfLineKey) {
                columnSet.add('_key');
            } else if (typeof keyPath === 'string') {
                columnSet.add(keyPath);
            } else if (Array.isArray(keyPath)) {
                for (const kp of keyPath) columnSet.add(kp);
            }

            for (let i = 0; i < values.length; i++) {
                const rawVal = values[i];
                const key = keys[i];
                let rowObj: DbRow;

                if (typeof rawVal === 'object' && rawVal !== null && !Array.isArray(rawVal)) {
                    rowObj = { ...rawVal as Record<string, unknown> };
                    if (hasOutOfLineKey && key !== undefined) {
                        rowObj = { _key: key, ...rowObj };
                    }
                } else {
                    rowObj = {
                        _key: key,
                        value: rawVal
                    };
                }

                for (const k of Object.keys(rowObj)) {
                    columnSet.add(k);
                }
                rows.push(rowObj);
            }

            tables.push({
                storeName,
                keyPath,
                autoIncrement,
                columns: sortColumns(Array.from(columnSet)),
                rows
            });
        }

        db.close();

        results.push({
            name: target.name,
            version: db.version,
            tables
        });
    }

    return results;
}

interface TableCardProps {
    table: TableInfo;
}

const TableCard: React.FC<TableCardProps> = ({ table }) => {
    const [filter, setFilter] = useState('');
    const [isCollapsed, setIsCollapsed] = useState(false);

    const filteredRows = table.rows.filter(row => {
        if (!filter.trim()) return true;
        const q = filter.toLowerCase();
        return Object.values(row).some(val => {
            if (val === null || val === undefined) return false;
            if (typeof val === 'object') {
                return JSON.stringify(val).toLowerCase().includes(q);
            }
            return String(val).toLowerCase().includes(q);
        });
    });

    return (
        <div className="settings-card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Table: {table.storeName}</h3>
                    <span style={{
                        fontSize: '12px',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: 'var(--text-secondary)'
                    }}>
                        {filteredRows.length}{filteredRows.length !== table.rows.length ? ` of ${table.rows.length}` : ''} rows
                    </span>
                    <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#93c5fd',
                        fontFamily: 'monospace'
                    }}>
                        keyPath: {formatKeyPath(table.keyPath)}{table.autoIncrement ? ' (autoIncrement)' : ''}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Filter rows..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        style={{ padding: '6px 12px', fontSize: '13px', width: '160px' }}
                    />
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        style={{ padding: '6px 10px', fontSize: '12px', minWidth: 'auto' }}
                        title={isCollapsed ? 'Expand table' : 'Collapse table'}
                    >
                        {isCollapsed ? 'Expand' : 'Collapse'}
                    </button>
                </div>
            </div>

            {!isCollapsed && (
                <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto', marginTop: '12px' }}>
                    {filteredRows.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                            <thead>
                                <tr>
                                    {table.columns.map(col => (
                                        <th
                                            key={col}
                                            style={{
                                                position: 'sticky',
                                                top: 0,
                                                background: 'var(--bg-surface)',
                                                borderBottom: '2px solid var(--border-color)',
                                                padding: '10px 8px',
                                                color: 'var(--text-secondary)',
                                                fontWeight: 600,
                                                whiteSpace: 'nowrap',
                                                zIndex: 1
                                            }}
                                        >
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        {table.columns.map(col => (
                                            <td key={col} style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                                                {renderCellValue(row[col])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p style={{ color: 'var(--text-secondary)', marginTop: '16px', fontSize: '14px' }}>
                            {table.rows.length === 0 ? 'No rows found in this table.' : 'No rows match filter.'}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export const DatabaseExplorer = observer(() => {
    const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
    const [loading, setLoading] = useState(true);

    const refreshData = useCallback(async () => {
        setLoading(true);
        const data = await loadAllDatabases();
        setDatabases(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                <div style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Loading DB Data...</div>
            </div>
        );
    }

    const totalTables = databases.reduce((acc, db) => acc + db.tables.length, 0);

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>Database Explorer</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Discovered {databases.length} database{databases.length === 1 ? '' : 's'} with {totalTables} table{totalTables === 1 ? '' : 's'}
                    </p>
                </div>
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={refreshData}
                    style={{ padding: '8px 16px', fontSize: '14px' }}
                >
                    ↻ Refresh
                </button>
            </div>

            {databases.length === 0 ? (
                <div className="settings-card">
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No IndexedDB databases found on this origin.</p>
                </div>
            ) : (
                databases.map(db => (
                    <div key={db.name} style={{ marginBottom: '32px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>
                                Database: <span style={{ color: 'var(--accent-color)' }}>{db.name}</span>
                            </h3>
                            <span style={{
                                fontSize: '12px',
                                padding: '2px 8px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'rgba(255, 255, 255, 0.08)',
                                color: 'var(--text-secondary)'
                            }}>
                                version {db.version}
                            </span>
                        </div>

                        {db.error && (
                            <div className="settings-card" style={{ borderLeft: '4px solid var(--danger-color)', marginBottom: '16px' }}>
                                <p style={{ color: 'var(--danger-color)', margin: 0 }}>Error accessing database: {db.error}</p>
                            </div>
                        )}

                        {db.tables.length === 0 && !db.error && (
                            <div className="settings-card">
                                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No tables (object stores) found in this database.</p>
                            </div>
                        )}

                        {db.tables.map(table => (
                            <TableCard key={table.storeName} table={table} />
                        ))}
                    </div>
                ))
            )}
        </div>
    );
});
