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

async function findLockFile(folderId?: string): Promise<Result<LockEntry | null>> {
    const escapedName = LOCK_FILE_NAME.replace(/'/g, "\\'");
    let query = `name = '${escapedName}' and mimeType = 'application/json' and trashed = false`;
    if (folderId) {
        query += ` and '${folderId}' in parents`;
    }

    const filesRes = await googleDriveService.listFiles(query, ['createdTime', 'appProperties']);
    if (filesRes.error) return err(new AggregateError([filesRes.error], "failed to search for lock file"));

    if (filesRes.data.length === 0) {
        return ok(null);
    }

    const file = filesRes.data[0];
    const lockFileId = file.id as string;
    const createdTime = file.createdTime as string;
    
    let lockInfo: LockInfo;
    if (file.appProperties && file.appProperties.deviceId) {
        lockInfo = {
            deviceId: file.appProperties.deviceId,
            operation: file.appProperties.operation as "export" | "import"
        };
    } else {
        // Lock file exists but lacks appProperties — treat as stale, delete it
        await googleDriveService.deleteFile(lockFileId);
        return ok(null);
    }

    return ok({ id: lockFileId, content: lockInfo, createdTime });
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

export async function acquireLock(operation: "export" | "import", folderId?: string): Promise<Result<string>> {
    const deviceId = await getDeviceId();

    console.log(`[Lock] Attempting to acquire lock for operation: ${operation}. Max retries: ${LOCK_ACQUIRE_MAX_RETRIES}`);
    for (let attempt = 0; attempt <= LOCK_ACQUIRE_MAX_RETRIES; attempt++) {
        console.log(`[Lock] --- Attempt ${attempt + 1} ---`);
        console.time(`[Lock] Phase 1: Search existing lock (Attempt ${attempt + 1})`);
        const lockRes = await findLockFile(folderId);
        console.timeEnd(`[Lock] Phase 1: Search existing lock (Attempt ${attempt + 1})`);
        if (lockRes.error) return err(new AggregateError([lockRes.error], "failed to check lock"));

        const existingLock = lockRes.data;

        if (existingLock === null) {
            console.log(`[Lock] No existing lock found. Proceeding to create one.`);
            // No lock — create one
            console.time(`[Lock] Phase 2: Create lock file`);
            const createRes = await createLockFile(operation, folderId);
            console.timeEnd(`[Lock] Phase 2: Create lock file`);
            if (createRes.error) return err(createRes.error);

            // Verify we own the lock (race condition check):
            // Re-read the lock file to ensure our device wrote it.
            // If there are multiple lock files, another device raced with us.
            console.time(`[Lock] Phase 3: Verify race condition`);
            const verifyRes = await findAllLockFiles(folderId);
            console.timeEnd(`[Lock] Phase 3: Verify race condition`);
            if (verifyRes.error) return err(new AggregateError([verifyRes.error], "failed to verify lock ownership"));

            if (verifyRes.data.length === 1) {
                // We are the sole owner
                console.log(`[Lock] Acquired lock successfully without collision.`);
                return ok(createRes.data.id);
            }

            console.log(`[Lock] Collision detected: ${verifyRes.data.length} locks found. Resolving...`);

            // Multiple lock files — race condition. Keep the one with the earliest createdTime
            // (server-assigned, no clock skew), or if tied, the lexicographically smallest deviceId.
            const ours = verifyRes.data.find(l => l.content.deviceId === deviceId);
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

        // Lock exists
        console.log(`[Lock] Existing lock found (owned by: ${existingLock.content.deviceId}, age: ${Date.now() - new Date(existingLock.createdTime).getTime()}ms).`);
        if (existingLock.content.deviceId === deviceId) {
            // Our own stale lock — overwrite it
            console.log(`[Lock] Overwriting our own stale lock...`);
            await googleDriveService.deleteFile(existingLock.id);
            console.time(`[Lock] Phase 2: Create lock file`);
            const createRes = await createLockFile(operation, folderId);
            console.timeEnd(`[Lock] Phase 2: Create lock file`);
            if (createRes.error) return err(createRes.error);
            return ok(createRes.data.id);
        }

        if (isLockStale(existingLock.createdTime)) {
            // Another device's stale lock — remove it and retry
            console.log(`[Lock] Removing stale lock from another device...`);
            await googleDriveService.deleteFile(existingLock.id);
            continue;
        }

        // Another device holds an active lock
        console.log(`[Lock] Active lock held by another device. Waiting before retry...`);
        if (attempt < LOCK_ACQUIRE_MAX_RETRIES) {
            await sleep(LOCK_ACQUIRE_RETRY_MS);
            continue;
        }

        return err(new Error(
            `Синхронизация заблокирована другим устройством (операция: ${existingLock.content.operation}). Попробуйте позже.`
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
