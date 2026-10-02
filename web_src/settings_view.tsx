import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';
import { authStore } from './auth_store';
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

                        {/* Synchronization Controls & Progress */}
                        <div style={{ marginTop: '14px', marginBottom: '14px', padding: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>Синхронизация операций</div>
                            
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: authStore.isSyncing || authStore.syncProgress ? '10px' : '0' }}>
                                <button
                                    className="btn btn-primary"
                                    disabled={authStore.isSyncing || authStore.isLoadingBalance}
                                    onClick={() => store.syncTBankRecent()}
                                    style={{ fontSize: '12px', padding: '6px 12px', background: '#ffdd2d', color: '#333', fontWeight: 600 }}
                                    title="Загрузить операции за последний месяц (35 дней) и обновить статусы"
                                >
                                    {authStore.isSyncing ? 'Синхронизация...' : 'Обновить операции'}
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    disabled={authStore.isSyncing || authStore.isLoadingBalance}
                                    onClick={() => {
                                        if (window.confirm('Запустить полную загрузку операций во всю глубину до 2010 года? Запросы будут отправляться с интервалом в 1 сек.')) {
                                            store.syncTBankFull();
                                        }
                                    }}
                                    style={{ fontSize: '12px', padding: '6px 12px' }}
                                    title="Помесячная загрузка истории в прошлое до 2010 года с задержкой 1 сек"
                                >
                                    Полная загрузка (до 2010)
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    disabled={authStore.isSyncing}
                                    onClick={() => {
                                        if (window.confirm('Очистить все локальные операции Т-Банка из таблицы bank_operations?')) {
                                            store.resetTBankOperations();
                                        }
                                    }}
                                    style={{ fontSize: '12px', padding: '6px 12px', color: 'var(--danger-color)' }}
                                    title="Удалить операции этого банка из локальной таблицы"
                                >
                                    Очистить операции
                                </button>
                            </div>

                            {/* Progress bar */}
                            {authStore.isSyncing && (
                                <div style={{ marginTop: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '4px' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>{authStore.syncProgress}</span>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--danger-color)' }}
                                            onClick={() => authStore.cancelSync()}
                                        >
                                            Отмена
                                        </button>
                                    </div>
                                    <div style={{ height: '6px', width: '100%', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div
                                            style={{
                                                height: '100%',
                                                width: `${Math.max(5, authStore.syncPercent)}%`,
                                                background: '#ffdd2d',
                                                transition: 'width 0.3s ease',
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {!authStore.isSyncing && authStore.syncProgress && (
                                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--success-color)' }}>
                                    ✓ {authStore.syncProgress}
                                </div>
                            )}

                            {authStore.syncError && (
                                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger-color)' }}>
                                    ✗ Ошибка синхронизации: {authStore.syncError}
                                </div>
                            )}
                        </div>

                        {authStore.accounts.length > 0 && (
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                    Счета Т-Банка и привязка:
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {authStore.accounts.map((acc) => {
                                        const mappedName = store.bankAccountMapping.get(acc.id) || store.bankAccountMapping.get(`tbank:${acc.id}`);
                                        return (
                                            <div
                                                key={acc.id}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px',
                                                    padding: '10px 14px',
                                                    background: 'rgba(255, 255, 255, 0.04)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    fontSize: '13px',
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{acc.name || acc.accountType}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                            ID: {acc.id} {acc.accountType ? `• ${acc.accountType}` : ''}
                                                        </div>
                                                    </div>
                                                    <div style={{ fontWeight: 700, fontSize: '14px' }}>
                                                        {acc.moneyAmount && typeof acc.moneyAmount.value === 'number'
                                                            ? `${acc.moneyAmount.value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${acc.moneyAmount.currency?.name === 'RUB' ? '₽' : acc.moneyAmount.currency?.name || ''}`
                                                            : '—'}
                                                    </div>
                                                </div>

                                                {/* Mapping Status */}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px', marginTop: '2px' }}>
                                                    {mappedName ? (
                                                        <span style={{ fontSize: '12px', color: 'var(--success-color)' }}>
                                                            ✓ Связан со счётом: <strong>{mappedName}</strong>
                                                        </span>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', width: '100%', flexWrap: 'wrap' }}>
                                                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                                Не привязан к счёту
                                                            </span>
                                                            <select
                                                                className="form-input"
                                                                style={{ fontSize: '11px', padding: '2px 6px', height: '24px', flex: 1, minWidth: '120px' }}
                                                                defaultValue=""
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    if (val) {
                                                                        store.linkBankAccount(val, acc.id);
                                                                    }
                                                                }}
                                                            >
                                                                <option value="" disabled>Привязать к счёту...</option>
                                                                {store.accounts.map((a) => (
                                                                    <option key={a.id} value={a.name}>{a.name}</option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary"
                                                                style={{ padding: '2px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
                                                                onClick={() => {
                                                                    const accName = prompt('Название нового счёта в MMM:', acc.name || 'Т-Банк');
                                                                    if (accName) {
                                                                        store.linkBankAccount(
                                                                            accName,
                                                                            acc.id,
                                                                            String(acc.moneyAmount?.value || '0'),
                                                                            acc.moneyAmount?.currency?.name || 'RUB'
                                                                        );
                                                                    }
                                                                }}
                                                            >
                                                                + Создать счёт
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="settings-card">
                <h3>Управление данными</h3>
                <div className="settings-text" style={{ marginBottom: '16px' }}>
                    Очистка локальных таблиц и сброс состояния на этом устройстве. Данные на Google Диске затронуты не будут.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-sm)' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>Удалить транзакции</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                Очистить все локальные операции ({store.transactions.length} шт.)
                            </div>
                        </div>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ color: 'var(--danger-color)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                            onClick={() => {
                                if (window.confirm('Удалить все локальные транзакции?')) {
                                    store.clearTransactions();
                                }
                            }}
                        >
                            Удалить
                        </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-sm)' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>Удалить счета</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                Очистить все локальные счета ({store.accounts.length} шт.)
                            </div>
                        </div>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ color: 'var(--danger-color)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                            onClick={() => {
                                if (window.confirm('Удалить все локальные счета?')) {
                                    store.clearAccounts();
                                }
                            }}
                        >
                            Удалить
                        </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-sm)' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>Удалить динамические данные</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                Сбросить рассчитанные остатки счетов в 0 и кэш балансов банков
                            </div>
                        </div>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ color: 'var(--text-secondary)' }}
                            onClick={() => {
                                if (window.confirm('Сбросить динамические данные (рассчитанные остатки и кэш балансов)?')) {
                                    store.clearDynamicData();
                                }
                            }}
                        >
                            Сбросить
                        </button>
                    </div>

                    <div style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                        <button
                            type="button"
                            className="btn"
                            style={{
                                width: '100%',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: 'var(--danger-color)',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                fontWeight: 600,
                                padding: '10px'
                            }}
                            onClick={() => {
                                if (window.confirm('ВНИМАНИЕ: Вы уверены, что хотите удалить ВСЕ локальные данные, включая авторизацию? Это действие необратимо.')) {
                                    store.clearAllLocalData();
                                }
                            }}
                        >
                            Удалить все локальные данные (включая авторизацию)
                        </button>
                    </div>
                </div>
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
