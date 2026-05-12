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
    try {
      await requestToPromise(db.transaction('batches', 'readwrite').objectStore('batches').add(stored));
    } catch {
      this.disableIdb(db);
      this.enqueueMemory(stored);
      return;
    }
    try {
      await this.evictIdb(db);
    } catch {
      this.disableIdb(db);
    }
  }

  async drain(send: (batch: OfflineBatch) => Promise<void>, batchesPerSecond = 2): Promise<void> {
    const delay = batchesPerSecond > 0 ? 1000 / batchesPerSecond : 0;
    while (true) {
      const batch = await this.peek();
      if (!batch) return;
      await send(batch);
      await this.remove(batch);
      if (!(await this.peek())) return;
      if (delay > 0) await sleep(delay);
    }
  }

  async sizeBytes(): Promise<number> {
    const db = await this.openDb();
    if (!db) return this.memory.reduce((sum, item) => sum + item.size, 0);
    try {
      const batches = await this.getAll(db);
      return batches.reduce((sum, item) => sum + item.size, 0);
    } catch {
      this.disableIdb(db);
      return this.memory.reduce((sum, item) => sum + item.size, 0);
    }
  }

  private async peek(): Promise<StoredBatch | undefined> {
    const db = await this.openDb();
    if (!db) return this.memory[0];
    try {
      const tx = db.transaction('batches', 'readonly');
      const store = tx.objectStore('batches');
      const cursor = await requestToPromise<IDBCursorWithValue | null>(store.openCursor());
      if (!cursor) return undefined;
      const batch = cursor.value as StoredBatch;
      if (batch.id === undefined && typeof cursor.primaryKey === 'number') batch.id = cursor.primaryKey;
      return batch;
    } catch {
      this.disableIdb(db);
      return this.memory[0];
    }
  }

  private async remove(batch: StoredBatch): Promise<void> {
    const db = await this.openDb();
    if (!db) {
      if (this.memory[0] === batch) this.memory.shift();
      return;
    }
    if (batch.id === undefined) return;
    try {
      await requestToPromise(db.transaction('batches', 'readwrite').objectStore('batches').delete(batch.id));
    } catch {
      this.disableIdb(db);
    }
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

  private disableIdb(db: IDBDatabase): void {
    try {
      db.close();
    } catch {
      // Ignore close failures; future queue operations will use memory storage.
    }
    this.dbPromise = Promise.resolve(undefined);
  }
}

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
