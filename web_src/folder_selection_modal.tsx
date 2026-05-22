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
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '90%', maxWidth: '400px',
                maxHeight: '80vh', display: 'flex', flexDirection: 'column'
            }}>
                <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Выбор папки для синхронизации</h3>
                
                <div style={{ marginBottom: '15px', display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', fontSize: '14px' }}>
                    {path.map((folder, index) => (
                        <React.Fragment key={folder.id}>
                            <span 
                                onClick={() => navigateUp(index)}
                                style={{ 
                                    cursor: index === path.length - 1 ? 'default' : 'pointer', 
                                    color: index === path.length - 1 ? '#333' : '#007bff',
                                    fontWeight: index === path.length - 1 ? 'bold' : 'normal'
                                }}
                            >
                                {folder.name}
                            </span>
                            {index < path.length - 1 && <span style={{ color: '#888' }}>/</span>}
                        </React.Fragment>
                    ))}
                </div>

                {error && <div style={{ color: 'red', marginBottom: '15px' }}>Ошибка: {error}</div>}

                <div style={{ 
                    flex: 1, overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px', padding: '5px',
                    minHeight: '200px'
                }}>
                    {isLoading ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Загрузка...</div>
                    ) : folders.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Папка пуста</div>
                    ) : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {folders.map(folder => (
                                <li key={folder.id}>
                                    <button 
                                        onClick={() => navigateTo(folder)}
                                        style={{
                                            width: '100%', textAlign: 'left', padding: '10px', background: 'none',
                                            border: 'none', borderBottom: '1px solid #f5f5f5', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '10px'
                                        }}
                                    >
                                        <span style={{ fontSize: '20px' }}>📁</span>
                                        {folder.name}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', background: 'none', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}>
                        Отмена
                    </button>
                    <button onClick={selectCurrentFolder} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        Выбрать эту папку
                    </button>
                </div>
            </div>
        </div>
    );
};
