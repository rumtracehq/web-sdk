export interface OfflineBatch {
  path: string;
  contentType: string;
  body: ArrayBuffer;
  headers: Record<string, string>;
  enqueuedAt: number;
}

export interface OfflineQueueOptions {
  dbName?: string;
  indexedDbCapBytes?: number;
  memoryCapBytes?: number;
  now?: () => number;
}

interface StoredBatch extends OfflineBatch {
  id?: number;
  size: number;
}

export class OfflineQueue {
  private readonly indexedDbCapBytes: number;
  private readonly memoryCapBytes: number;
  private readonly now: () => number;
  private readonly dbName: string;
  private memory: StoredBatch[] = [];
  private dbPromise: Promise<IDBDatabase | undefined> | undefined;

  constructor(options: OfflineQueueOptions = {}) {
    this.indexedDbCapBytes = options.indexedDbCapBytes ?? 5 * 1024 * 1024;
    this.memoryCapBytes = options.memoryCapBytes ?? 1024 * 1024;
    this.now = options.now ?? (() => Date.now());
    this.dbName = options.dbName ?? 'rum-web-sdk-offline';
  }

  async enqueue(batch: Omit<OfflineBatch, 'enqueuedAt'> & { enqueuedAt?: number }): Promise<void> {
    const stored: StoredBatch = {
      ...batch,
      enqueuedAt: batch.enqueuedAt ?? this.now(),
      size: batch.body.byteLength
    };
    const db = await this.openDb();
    if (!db) {
      this.enqueueMemory(stored);
      return;
    }
    await requestToPromise(db.transaction('batches', 'readwrite').objectStore('batches').add(stored));
    await this.evictIdb(db);
  }

  async drain(send: (batch: OfflineBatch) => Promise<void>, batchesPerSecond = 2): Promise<void> {
    const delay = 1000 / batchesPerSecond;
    while (true) {
      const batch = await this.shift();
      if (!batch) return;
      await send(batch);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  async sizeBytes(): Promise<number> {
    const db = await this.openDb();
    if (!db) return this.memory.reduce((sum, item) => sum + item.size, 0);
    const batches = await this.getAll(db);
    return batches.reduce((sum, item) => sum + item.size, 0);
  }

  private async shift(): Promise<StoredBatch | undefined> {
    const db = await this.openDb();
    if (!db) return this.memory.shift();
    const tx = db.transaction('batches', 'readwrite');
    const store = tx.objectStore('batches');
    const cursor = await requestToPromise<IDBCursorWithValue | null>(store.openCursor());
    if (!cursor) return undefined;
    const batch = cursor.value as StoredBatch;
    await requestToPromise(cursor.delete());
    return batch;
  }

  private enqueueMemory(batch: StoredBatch): void {
    this.memory.push(batch);
    while (this.memory.reduce((sum, item) => sum + item.size, 0) > this.memoryCapBytes) this.memory.shift();
  }

  private async evictIdb(db: IDBDatabase): Promise<void> {
    let batches = await this.getAll(db);
    while (batches.reduce((sum, item) => sum + item.size, 0) > this.indexedDbCapBytes && batches.length > 0) {
      const oldest = batches[0];
      if (oldest.id !== undefined) {
        await requestToPromise(db.transaction('batches', 'readwrite').objectStore('batches').delete(oldest.id));
      }
      batches = batches.slice(1);
    }
  }

  private async getAll(db: IDBDatabase): Promise<StoredBatch[]> {
    return requestToPromise<StoredBatch[]>(db.transaction('batches', 'readonly').objectStore('batches').getAll());
  }

  private async openDb(): Promise<IDBDatabase | undefined> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(undefined);
        return;
      }
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('batches')) db.createObjectStore('batches', { keyPath: 'id', autoIncrement: true });
      };
      request.onerror = () => resolve(undefined);
      request.onsuccess = () => resolve(request.result);
    });
    return this.dbPromise;
  }
}

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
