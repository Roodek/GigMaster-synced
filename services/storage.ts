
import { DB_NAME, DB_VERSION, STORES, INITIAL_TAGS } from '../constants';
import { Sheet, Setlist, AnnotationLayer, SheetPage, TagDef } from '../types';

class StorageService {
  private db: IDBDatabase | null = null;
  private sheetCache: Map<string, Sheet> = new Map();
  private annotationCache: Map<string, AnnotationLayer> = new Map();

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORES.SHEETS)) {
          db.createObjectStore(STORES.SHEETS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.SETLISTS)) {
          db.createObjectStore(STORES.SETLISTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.ANNOTATIONS)) {
          db.createObjectStore(STORES.ANNOTATIONS, { keyPath: 'sheetId' });
        }
        if (!db.objectStoreNames.contains(STORES.TAGS)) {
          const tagStore = db.createObjectStore(STORES.TAGS, { keyPath: 'label' });
          INITIAL_TAGS.forEach(tag => tagStore.add(tag));
        }
      };
    });
  }

  /**
   * Clears all stored data (sheets, setlists, and annotations).
   * Can be used to reset the application state.
   */
  async clearDatabase(): Promise<void> {
    if (!this.db) await this.init();
    this.sheetCache.clear();
    this.annotationCache.clear();
    const stores = [STORES.SHEETS, STORES.SETLISTS, STORES.ANNOTATIONS];
    for (const storeName of stores) {
      await this.transaction(storeName, 'readwrite', (store) => store.clear());
    }
  }

  private async transaction<T>(storeName: string, mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let request: IDBRequest | void;

      try {
        request = callback(store);
      } catch (e) {
        reject(e);
        return;
      }

      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Sheets ---

  async addSheet(sheet: Sheet): Promise<void> {
    this.sheetCache.set(sheet.id, sheet);
    await this.transaction(STORES.SHEETS, 'readwrite', (store) => store.put(sheet));
  }

  async updateSheetMetadata(sheet: Sheet): Promise<void> {
    const existing = await this.getSheet(sheet.id);
    if (!existing) throw new Error('Sheet not found');
    
    const record: Sheet = { 
      ...existing, 
      name: sheet.name, 
      tags: sheet.tags,
      tagIcons: sheet.tagIcons
    };
    this.sheetCache.set(sheet.id, record);
    await this.transaction(STORES.SHEETS, 'readwrite', (store) => store.put(record));
  }

  async getAllSheets(): Promise<Sheet[]> {
    const sheets = await this.transaction<Sheet[]>(STORES.SHEETS, 'readonly', (store) => store.getAll());
    if (sheets) {
      sheets.forEach(s => this.sheetCache.set(s.id, s));
    }
    return sheets;
  }

  async getSheet(id: string): Promise<Sheet | undefined> {
    if (this.sheetCache.has(id)) {
      return this.sheetCache.get(id);
    }
    const sheet = await this.transaction<Sheet>(STORES.SHEETS, 'readonly', (store) => store.get(id));
    if (sheet) {
      this.sheetCache.set(id, sheet);
    }
    return sheet;
  }

  async deleteSheet(id: string): Promise<void> {
    this.sheetCache.delete(id);
    await this.transaction(STORES.SHEETS, 'readwrite', (store) => store.delete(id));
    await this.deleteAnnotation(id);
    const setlists = await this.getAllSetlists();
    for (const list of setlists) {
        if (list.sheetIds.includes(id)) {
            list.sheetIds = list.sheetIds.filter(sheetId => sheetId !== id);
            await this.saveSetlist(list);
        }
    }
  }

  // --- Setlists ---

  async saveSetlist(setlist: Setlist): Promise<void> {
    await this.transaction(STORES.SETLISTS, 'readwrite', (store) => store.put(setlist));
  }

  async getAllSetlists(): Promise<Setlist[]> {
    return this.transaction(STORES.SETLISTS, 'readonly', (store) => store.getAll());
  }

  async deleteSetlist(id: string): Promise<void> {
    await this.transaction(STORES.SETLISTS, 'readwrite', (store) => store.delete(id));
  }

  // --- Annotations ---

  async saveAnnotation(sheetId: string, strokes: any[]): Promise<void> {
    const layer = { sheetId, strokes };
    this.annotationCache.set(sheetId, layer);
    await this.transaction(STORES.ANNOTATIONS, 'readwrite', (store) => store.put(layer));
  }

  async getAnnotation(sheetId: string): Promise<AnnotationLayer | undefined> {
    if (this.annotationCache.has(sheetId)) {
      return this.annotationCache.get(sheetId);
    }
    const layer = await this.transaction<AnnotationLayer>(STORES.ANNOTATIONS, 'readonly', (store) => store.get(sheetId));
    if (layer) {
      this.annotationCache.set(sheetId, layer);
    }
    return layer;
  }

  async deleteAnnotation(sheetId: string): Promise<void> {
    this.annotationCache.delete(sheetId);
    await this.transaction(STORES.ANNOTATIONS, 'readwrite', (store) => store.delete(sheetId));
  }

  // --- Tags ---

  async getAllTags(): Promise<TagDef[]> {
    return this.transaction(STORES.TAGS, 'readonly', (store) => store.getAll());
  }

  async saveTag(tag: TagDef): Promise<void> {
    await this.transaction(STORES.TAGS, 'readwrite', (store) => store.put(tag));
  }

  async deleteTag(label: string): Promise<void> {
    await this.transaction(STORES.TAGS, 'readwrite', (store) => store.delete(label));
  }
}

export const storage = new StorageService();
