import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { authStore } from './auth_store';
import { sberAuthStore } from './sber_auth_store';
import {
    getProxyEndpoint,
    setProxyEndpoint,
    resetProxyEndpoint,
    proxyFetch,
} from './infrastructure/proxy';

export const SettingsView = observer(() => {
    const [proxyEndpoint, setProxyEndpointState] = useState(getProxyEndpoint());
    const [isTestingProxy, setIsTestingProxy] = useState(false);
    const [testResult, setTestResult] = useState<{
        success: boolean;
        status?: number;
        statusText?: string;
        bodySnippet?: string;
        error?: string;
    } | null>(null);

    const handleEndpointChange = (val: string) => {
        setProxyEndpointState(val);
        setProxyEndpoint(val);
    };

    const handleResetEndpoint = () => {
        const def = resetProxyEndpoint();
        setProxyEndpointState(def);
        setTestResult(null);
    };

    const handleTestProxy = async () => {
        setIsTestingProxy(true);
        setTestResult(null);

        const res = await proxyFetch('https://example.com', {
            proxyEndpoint,
        });

        if (res.error !== null) {
            setTestResult({
                success: false,
                error: res.error.message || String(res.error),
            });
            setIsTestingProxy(false);
            return;
        }

        const textRes = await res.data.text();
        const snippet = textRes.error === null
            ? textRes.data.slice(0, 300) + (textRes.data.length > 300 ? '...' : '')
            : 'Не удалось прочитать тело ответа';

        setTestResult({
            success: res.data.ok,
            status: res.data.status,
            statusText: res.data.statusText,
            bodySnippet: snippet,
        });
        setIsTestingProxy(false);
    };

    return (
        <div className="settings-section">
            <div className="settings-card">
                <h3>Синхронизация Google Drive</h3>
                <div className="settings-text">
                    Текущая папка: <strong>{store.syncFolderName || 'Корневая папка (Мой диск)'}</strong>
                    <a
                        href={store.syncFolderId ? `https://drive.google.com/drive/folders/${store.syncFolderId}` : 'https://drive.google.com/drive/my-drive'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="settings-link"
                        style={{ marginLeft: '10px' }}
                    >
                        (Открыть в Google Drive ↗)
                    </a>
                </div>
                <div className="settings-text">
                    Google Аккаунт: <strong>{store.googleAccountEmail || 'Не авторизован (появится после первого экспорта/импорта)'}</strong>
                </div>
                <button
                    onClick={() => store.openFolderModal()}
                    className="btn btn-secondary"
                    style={{ marginBottom: '20px' }}
                >
                    Выбрать другую папку
                </button>
                
                <div className="action-row">
                    <button
                        onClick={() => store.exportToGoogleDrive()}
                        className="btn btn-primary"
                        disabled={store.isLoading}
                    >
                        {store.isLoading ? 'Экспорт...' : 'Экспорт в Google Drive'}
                    </button>
                    <button
                        onClick={() => store.importFromGoogleDrive()}
                        className="btn btn-secondary"
                        disabled={store.isLoading}
                    >
                        {store.isLoading ? 'Импорт...' : 'Импорт из Google Drive'}
                    </button>
                </div>
                {store.syncProgress && (
                    <div className="progress-badge" style={{ marginTop: '16px', display: 'inline-block' }}>
                        {store.syncProgress}
                    </div>
                )}
            </div>

            <div className="settings-card">
                <h3>Yandex Serverless Proxy</h3>
                <div className="settings-text">
                    Эндпоинт API Gateway для обхода CORS:
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input
                        type="text"
                        className="form-input"
                        value={proxyEndpoint}
                        onChange={(e) => handleEndpointChange(e.target.value)}
                        placeholder="https://...apigw.yandexcloud.net/proxy"
                        style={{ flex: 1, fontSize: '13px' }}
                    />
                    <button
                        className="btn btn-secondary"
                        onClick={handleResetEndpoint}
                        title="Сбросить на URL по умолчанию"
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        Сброс
                    </button>
                </div>

                <div className="action-row">
                    <button
                        id="test-proxy-btn"
                        onClick={handleTestProxy}
                        className="btn btn-primary"
                        disabled={isTestingProxy}
                    >
                        {isTestingProxy ? 'Отправка запроса...' : 'Проверить прокси (запрос на example.com)'}
                    </button>
                </div>

                {testResult && (
                    <div
                        style={{
                            marginTop: '16px',
                            padding: '12px 14px',
                            borderRadius: 'var(--radius-sm)',
                            background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${testResult.success ? 'var(--success-color)' : 'var(--danger-color)'}`,
                        }}
                    >
                        <div style={{ fontWeight: 600, marginBottom: '6px', color: testResult.success ? 'var(--success-color)' : 'var(--danger-color)' }}>
                            {testResult.success ? `✓ Успешно: ${testResult.status} ${testResult.statusText}` : `✗ Ошибка: ${testResult.status ? testResult.status + ' ' + testResult.statusText : 'Ошибка соединения'}`}
                        </div>
                        {testResult.error && (
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                                {testResult.error}
                            </div>
                        )}
                        {testResult.bodySnippet && (
                            <pre
                                style={{
                                    margin: '8px 0 0 0',
                                    padding: '8px',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                    maxHeight: '150px',
                                    overflowY: 'auto',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                {testResult.bodySnippet}
                            </pre>
                        )}
                    </div>
                )}
            </div>

            <div className="settings-card">
                <h3>Т-Банк (T-Bank)</h3>
                <div className="settings-text" style={{ marginBottom: '12px' }}>
                    Статус: <strong style={{ color: authStore.isAuthenticated ? 'var(--success-color)' : 'var(--text-secondary)' }}>
                        {authStore.isAuthenticated ? '✓ Авторизован' : 'Не авторизован'}
                    </strong>
                </div>

                <div className="action-row" style={{ marginBottom: authStore.isAuthenticated ? '16px' : '0' }}>
                    {!authStore.isAuthenticated ? (
                        <button
                            id="open-auth"
                            onClick={() => authStore.startLogin()}
                            className="btn btn-primary"
                            style={{ background: '#ffdd2d', color: '#333', fontWeight: 600 }}
                        >
                            Войти в Т-Банк
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => authStore.loadBalance()}
                                className="btn btn-primary"
                                disabled={authStore.isLoadingBalance}
                                style={{ background: '#ffdd2d', color: '#333', fontWeight: 600 }}
                            >
                                {authStore.isLoadingBalance ? 'Обновление...' : 'Обновить баланс'}
                            </button>
                            <button
                                onClick={() => authStore.signOut()}
                                className="btn btn-secondary"
                            >
                                Выйти
                            </button>
                        </>
                    )}
                </div>

                {authStore.isAuthenticated && (
                    <div className="tbank-balance-section" style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            Текущий баланс:
                        </div>
                        <div style={{ fontSize: '26px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '12px' }}>
                            {authStore.totalBalance !== null
                                ? `${authStore.totalBalance.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
                                : authStore.isLoadingBalance ? 'Загрузка...' : '—'}
                        </div>

                        {authStore.balanceError && (
                            <div className="error-banner" style={{ margin: '8px 0', fontSize: '13px' }}>
                                {authStore.balanceError}
                            </div>
                        )}

                        {authStore.accounts.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                                {authStore.accounts.map((acc) => (
                                    <div
                                        key={acc.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '10px 14px',
                                            background: 'rgba(255, 255, 255, 0.04)',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: '13px',
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{acc.name || acc.accountType}</div>
                                            {acc.accountType && (
                                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                    {acc.accountType}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: '14px' }}>
                                            {acc.moneyAmount && typeof acc.moneyAmount.value === 'number'
                                                ? `${acc.moneyAmount.value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${acc.moneyAmount.currency?.name === 'RUB' ? '₽' : acc.moneyAmount.currency?.name || ''}`
                                                : '—'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="settings-card">
                <h3>СберБанк (Sberbank)</h3>
                <div className="settings-text" style={{ marginBottom: '12px' }}>
                    Статус: <strong style={{ color: sberAuthStore.isAuthenticated ? 'var(--success-color)' : 'var(--text-secondary)' }}>
                        {sberAuthStore.isAuthenticated ? '✓ Авторизован' : 'Не авторизован'}
                    </strong>
                </div>

                <div className="action-row" style={{ marginBottom: sberAuthStore.isAuthenticated ? '16px' : '0' }}>
                    {!sberAuthStore.isAuthenticated ? (
                        <button
                            id="open-sber-auth"
                            onClick={() => sberAuthStore.startLogin()}
                            className="btn btn-primary"
                            style={{ background: '#21a038', color: '#fff', fontWeight: 600 }}
                        >
                            Войти в СберБанк
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => sberAuthStore.loadBalance()}
                                className="btn btn-primary"
                                disabled={sberAuthStore.isLoadingBalance}
                                style={{ background: '#21a038', color: '#fff', fontWeight: 600 }}
                            >
                                {sberAuthStore.isLoadingBalance ? 'Обновление...' : 'Обновить баланс'}
                            </button>
                            <button
                                onClick={() => sberAuthStore.signOut()}
                                className="btn btn-secondary"
                            >
                                Выйти
                            </button>
                        </>
                    )}
                </div>

                {sberAuthStore.isAuthenticated && (
                    <div className="sber-balance-section" style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            Текущий баланс:
                        </div>
                        <div style={{ fontSize: '26px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '12px' }}>
                            {sberAuthStore.totalBalance !== null
                                ? `${sberAuthStore.totalBalance.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
                                : sberAuthStore.isLoadingBalance ? 'Загрузка...' : '—'}
                        </div>

                        {sberAuthStore.balanceError && (
                            <div className="error-banner" style={{ margin: '8px 0', fontSize: '13px' }}>
                                {sberAuthStore.balanceError}
                            </div>
                        )}

                        {sberAuthStore.accounts.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                                {sberAuthStore.accounts.map((acc) => (
                                    <div
                                        key={acc.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '10px 14px',
                                            background: 'rgba(255, 255, 255, 0.04)',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: '13px',
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{acc.name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                {acc.type === 'card' ? 'Карта' : acc.type === 'account' ? 'Счет' : 'Кредит'}
                                                {acc.number ? ` • ${acc.number}` : ''}
                                            </div>
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: '14px' }}>
                                            {typeof acc.balance === 'number'
                                                ? `${acc.balance.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${acc.currencyName || '₽'}`
                                                : '—'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="settings-card">
                <h3>Дополнительно</h3>
                <div className="action-row">
                    <button
                        onClick={() => store.setView('db_explorer')}
                        className="btn btn-secondary"
                    >
                        Database Explorer
                    </button>
                </div>
            </div>
        </div>
    );
});
