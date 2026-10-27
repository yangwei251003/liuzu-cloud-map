export const PROJECT_STORAGE_PREFIXES = ["liuzu-cloud-tour:", "liuzu-"] as const;
export const PROJECT_CACHE_PREFIX = "liuzu-cloud-tour-";

type RemovableStorage = Pick<Storage, "length" | "key" | "removeItem">;
type RemovableCacheStorage = Pick<CacheStorage, "keys" | "delete">;

export type ClearResult = {
  removed: string[];
  failed: string[];
  supported: boolean;
};

export function clearProjectStorage(storage: RemovableStorage | null): ClearResult {
  if (!storage) return { removed: [], failed: [], supported: false };
  const keys = new Set<string>();
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && PROJECT_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.add(key);
    }
  } catch {
    return { removed: [], failed: ["storage-enumeration"], supported: true };
  }

  const removed: string[] = [];
  const failed: string[] = [];
  for (const key of keys) {
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      failed.push(key);
    }
  }
  return { removed, failed, supported: true };
}

export async function clearProjectCaches(cacheStorage: RemovableCacheStorage | null): Promise<ClearResult> {
  if (!cacheStorage) return { removed: [], failed: [], supported: false };
  let keys: string[];
  try {
    keys = (await cacheStorage.keys()).filter((key) => key.startsWith(PROJECT_CACHE_PREFIX));
  } catch {
    return { removed: [], failed: ["cache-enumeration"], supported: true };
  }

  const removed: string[] = [];
  const failed: string[] = [];
  for (const key of keys) {
    try {
      if (await cacheStorage.delete(key)) removed.push(key);
      else failed.push(key);
    } catch {
      failed.push(key);
    }
  }
  return { removed, failed, supported: true };
}
