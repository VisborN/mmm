import "ts-error-as-value/lib/globals";
import { googleDriveService } from "./google_drive";
import { get, set } from "idb-keyval";

const LOCK_FILE_NAME = "_MMM_SYNC.lock";
const LOCK_STALE_MS = 5 * 60 * 1000; // 5 minutes
const LOCK_ACQUIRE_RETRY_MS = 2000;
const LOCK_ACQUIRE_MAX_RETRIES = 3;

export interface LockInfo {
    deviceId: string;
    operation: "export" | "import";
}

interface LockEntry {
    id: string;
    content: LockInfo;
    createdTime: string; // ISO timestamp from Google Drive server
}

async function getDeviceId(): Promise<string> {
    const stored = await get("mmm_device_id");
    if (stored) return stored as string;

    let id: string;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID();
    } else {
        id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    
    await set("mmm_device_id", id);
    return id;
}

function isLockStale(createdTime: string): boolean {
    const createdAt = new Date(createdTime).getTime();
    if (isNaN(createdAt)) return true;
    return Date.now() - createdAt > LOCK_STALE_MS;
}



async function createLockFile(operation: "export" | "import", folderId?: string): Promise<Result<{ id: string; createdTime: string }>> {
    const deviceId = await getDeviceId();
    const lockInfo: LockInfo = {
        deviceId,
        operation,
    };

    const uploadRes = await googleDriveService.uploadFile(
        LOCK_FILE_NAME,
        JSON.stringify(lockInfo),
        "application/json",
        folderId,
        undefined,
        lockInfo as unknown as Record<string, string>
    );
    if (uploadRes.error) return err(new AggregateError([uploadRes.error], "failed to create lock file"));

    return ok(uploadRes.data);
}

export async function acquireLock(operation: "export" | "import", folderId?: string, onProgress?: (msg: string) => void): Promise<Result<string>> {
    const deviceId = await getDeviceId();

    console.log(`[Lock] Attempting to acquire lock for operation: ${operation}. Max retries: ${LOCK_ACQUIRE_MAX_RETRIES}`);
    for (let attempt = 0; attempt <= LOCK_ACQUIRE_MAX_RETRIES; attempt++) {
        console.log(`[Lock] --- Attempt ${attempt + 1} ---`);
        const progressMsg = `Блокировка (попытка ${attempt + 1}): Поиск существующей блокировки...`;
        if (onProgress) onProgress(progressMsg);
        
        const t0 = Date.now();
        const lockRes = await findAllLockFiles(folderId);
        const t1 = Date.now();
        
        if (onProgress) onProgress(`${progressMsg} завершено за ${t1 - t0}мс`);
        if (lockRes.error) return err(new AggregateError([lockRes.error], "failed to check lock"));

        const existingLocks = lockRes.data;
        let hasOtherActiveLock = false;
        let otherActiveOperation = "";

        for (const lock of existingLocks) {
            if (lock.content.deviceId === deviceId) {
                console.log(`[Lock] Removing our previous lock...`);
                await googleDriveService.deleteFile(lock.id);
            } else if (isLockStale(lock.createdTime)) {
                console.log(`[Lock] Removing stale lock from another device...`);
                await googleDriveService.deleteFile(lock.id);
            } else {
                hasOtherActiveLock = true;
                otherActiveOperation = lock.content.operation;
            }
        }

        if (hasOtherActiveLock) {
            console.log(`[Lock] Active lock held by another device. Waiting before retry...`);
            if (onProgress) onProgress(`Блокировка: Активная блокировка другим устройством. Ожидание...`);
            if (attempt < LOCK_ACQUIRE_MAX_RETRIES) {
                await sleep(LOCK_ACQUIRE_RETRY_MS);
                continue;
            }
            return err(new Error(
                `Синхронизация заблокирована другим устройством (операция: ${otherActiveOperation}). Попробуйте позже.`
            ));
        }

        console.log(`[Lock] No active locks found. Proceeding to create one.`);
        const createMsg = `Блокировка: Создание нового файла блокировки...`;
        if (onProgress) onProgress(createMsg);
        
        const t2 = Date.now();
        const createRes = await createLockFile(operation, folderId);
        const t3 = Date.now();
        
        if (onProgress) onProgress(`${createMsg} завершено за ${t3 - t2}мс`);
        if (createRes.error) return err(createRes.error);

        // Verify we own the lock (race condition check):
        const verifyMsg = `Блокировка: Проверка отсутствия гонки данных...`;
        if (onProgress) onProgress(verifyMsg);
        
        const t4 = Date.now();
        let verifyRes = await findAllLockFiles(folderId);
        let verifyTries = 0;
        
        // Poll until we see our lock file (Google Drive search eventual consistency)
        while (!verifyRes.error && !verifyRes.data.find(l => l.content.deviceId === deviceId) && verifyTries < 5) {
            verifyTries++;
            console.log(`[Lock] Our lock not found in search results, retrying verification (attempt ${verifyTries})...`);
            if (onProgress) onProgress(`Блокировка: Индексация Google Drive задерживается. Ожидание (${verifyTries}/5)...`);
            await sleep(1000);
            verifyRes = await findAllLockFiles(folderId);
        }
        
        const t5 = Date.now();
        
        if (onProgress) onProgress(`${verifyMsg} завершено за ${t5 - t4}мс`);
        if (verifyRes.error) return err(new AggregateError([verifyRes.error], "failed to verify lock ownership"));

        const ours = verifyRes.data.find(l => l.content.deviceId === deviceId);
        if (!ours) {
            // Google Drive search index eventual consistency delay was too long.
            // We know we created a lock, but it's not showing up.
            console.log(`[Lock] Created lock still missing from search results. Deleting by ID and retrying outer loop.`);
            await googleDriveService.deleteFile(createRes.data.id);
            if (attempt < LOCK_ACQUIRE_MAX_RETRIES) {
                await sleep(LOCK_ACQUIRE_RETRY_MS);
                continue;
            }
            return err(new Error(`Не удалось подтвердить создание файла блокировки. Попробуйте позже.`));
        }

        if (verifyRes.data.length === 1 && verifyRes.data[0].content.deviceId === deviceId) {
            // We are the sole owner
            console.log(`[Lock] Acquired lock successfully without collision.`);
            return ok(createRes.data.id);
        }

        console.log(`[Lock] Collision detected or other lock found: ${verifyRes.data.length} locks. Resolving...`);

        // Multiple lock files — race condition. Keep the one with the earliest createdTime
        // (server-assigned, no clock skew), or if tied, the lexicographically smallest deviceId.
        const winner = verifyRes.data.reduce((a, b) => {
            const aTime = new Date(a.createdTime).getTime();
            const bTime = new Date(b.createdTime).getTime();
            if (aTime !== bTime) return aTime < bTime ? a : b;
            return a.content.deviceId < b.content.deviceId ? a : b;
        });

        if (winner.content.deviceId === deviceId) {
            // We won — delete the other lock files
            for (const lock of verifyRes.data) {
                if (lock.id !== winner.id) {
                    await googleDriveService.deleteFile(lock.id);
                }
            }
            return ok(winner.id);
        }

        // We lost — delete our lock file and retry
        if (ours) {
            console.log(`[Lock] Deleting our losing lock...`);
            await googleDriveService.deleteFile(ours.id);
        }

        if (attempt < LOCK_ACQUIRE_MAX_RETRIES) {
            console.log(`[Lock] Waiting before retry...`);
            await sleep(LOCK_ACQUIRE_RETRY_MS);
            continue;
        }

        return err(new Error(
            `Синхронизация заблокирована другим устройством (операция: ${winner.content.operation}). Попробуйте позже.`
        ));
    }

    return err(new Error("Не удалось получить блокировку синхронизации после нескольких попыток."));
}

export async function releaseLock(lockFileId: string): Promise<Result<void>> {
    const deleteRes = await googleDriveService.deleteFile(lockFileId);
    if (deleteRes.error) {
        return err(new AggregateError([deleteRes.error], "failed to release lock file"));
    }
    return ok(undefined);
}

async function findAllLockFiles(folderId?: string): Promise<Result<LockEntry[]>> {
    const escapedName = LOCK_FILE_NAME.replace(/'/g, "\\'");
    let query = `name = '${escapedName}' and mimeType = 'application/json' and trashed = false`;
    if (folderId) {
        query += ` and '${folderId}' in parents`;
    }

    const filesRes = await googleDriveService.listFiles(query, ['createdTime', 'appProperties']);
    if (filesRes.error) return err(new AggregateError([filesRes.error], "failed to list lock files"));

    const results: LockEntry[] = [];
    for (const file of filesRes.data) {
        if (!file.appProperties || !file.appProperties.deviceId) {
            console.log(`[Lock] Found unreadable/old lock file, deleting...`);
            await googleDriveService.deleteFile(file.id as string);
            continue; // Skip unreadable/old lock files
        }

        const lockInfo: LockInfo = {
            deviceId: file.appProperties.deviceId,
            operation: file.appProperties.operation as "export" | "import"
        };

        results.push({ id: file.id as string, content: lockInfo, createdTime: file.createdTime as string });
    }

    return ok(results);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
