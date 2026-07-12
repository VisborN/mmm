import React from 'react';
import { observer } from 'mobx-react-lite';
import { store } from './domain/store';

export const SettingsView = observer(() => {
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
                <h3>Дополнительно</h3>
                <div className="action-row">
                    <button id="open-auth" className="btn btn-primary" style={{ background: '#f59e0b', color: '#fff' }}>
                        Авторизация Tinkoff
                    </button>
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
