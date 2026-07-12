import React, { useState, useEffect } from 'react';
import { googleDriveService } from './infrastructure/google_drive';
import { store } from './domain/store';

interface Folder {
    id: string;
    name: string;
}

export const FolderSelectionModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [folders, setFolders] = useState<Folder[]>([]);
    const [path, setPath] = useState<Folder[]>([{ id: 'root', name: 'Мой диск' }]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const currentFolderId = path[path.length - 1].id;

    useEffect(() => {
        let isMounted = true;

        const loadFolders = async () => {
            setIsLoading(true);
            setError(null);
            
            const result = await googleDriveService.listFolders(currentFolderId === 'root' ? undefined : currentFolderId);
            
            if (isMounted) {
                if (result.error) {
                    setError(result.error.message);
                } else {
                    setFolders(result.data);
                }
                setIsLoading(false);
            }
        };

        loadFolders();

        return () => {
            isMounted = false;
        };
    }, [currentFolderId]);

    const navigateTo = (folder: Folder) => {
        setPath([...path, folder]);
    };

    const navigateUp = (index: number) => {
        setPath(path.slice(0, index + 1));
    };

    const selectCurrentFolder = async () => {
        const selected = path[path.length - 1];
        const idToSave = selected.id === 'root' ? null : selected.id;
        const nameToSave = selected.id === 'root' ? null : selected.name;
        
        await store.setSyncFolder(idToSave, nameToSave);
        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', height: '80vh' }}>
                <h3 style={{ marginBottom: '16px' }}>Выбор папки для синхронизации</h3>
                
                <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', fontSize: '14px' }}>
                    {path.map((folder, index) => (
                        <React.Fragment key={folder.id}>
                            <span 
                                onClick={() => navigateUp(index)}
                                style={{ 
                                    cursor: index === path.length - 1 ? 'default' : 'pointer', 
                                    color: index === path.length - 1 ? 'var(--text-primary)' : 'var(--accent-color)',
                                    fontWeight: index === path.length - 1 ? '600' : 'normal',
                                    transition: 'color 0.2s'
                                }}
                            >
                                {folder.name}
                            </span>
                            {index < path.length - 1 && <span style={{ color: 'var(--text-secondary)' }}>/</span>}
                        </React.Fragment>
                    ))}
                </div>

                {error && <div className="error-banner">Ошибка: {error}</div>}

                <div style={{ 
                    flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                    background: 'rgba(0,0,0,0.2)'
                }}>
                    {isLoading ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <div className="spinner" style={{ margin: '0 auto 16px', width: '24px', height: '24px', borderWidth: '2px' }}></div>
                            Загрузка...
                        </div>
                    ) : folders.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Папка пуста</div>
                    ) : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {folders.map(folder => (
                                <li key={folder.id}>
                                    <button 
                                        onClick={() => navigateTo(folder)}
                                        className="list-item"
                                        style={{ width: '100%', background: 'transparent', borderBottom: '1px solid var(--border-color)', borderRadius: 0 }}
                                    >
                                        <div className="item-left">
                                            <span style={{ fontSize: '20px' }}>📁</span>
                                            <span className="item-title">{folder.name}</span>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="modal-actions">
                    <button onClick={onClose} className="btn btn-secondary">Отмена</button>
                    <button onClick={selectCurrentFolder} className="btn btn-primary">Выбрать эту папку</button>
                </div>
            </div>
        </div>
    );
};
