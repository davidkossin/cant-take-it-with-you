import { migrateGame } from '../finance/Schema.js';
import { SAVE_KEY, PROFILE_KEY } from '../config.js';

/**
 * IndexedDB checkpoints with a synchronous session cache. Immutable timeline
 * records are stored once by content; checkpoints contain compact references.
 * Legacy localStorage records are migrated without changing their source data.
 */
const DATABASE = 'cant-take-it-plans';
const MAX_PENDING_RECORDS = 256, MAX_PENDING_BYTES = 64 * 1024 * 1024;
const records = new Map(), chunks = new Map(), pending = new Map(), persistedChunks = new Set();
let db = null, opening = null, queue = Promise.resolve();
let storageSource, idbSource, sequence = 0, rejectedWrite = null;
let status = { state: 'idle', message: 'Save storage has not been opened.', backend: 'session' };

export function getSaveStatus() { return { ...status, pending: pending.size }; }
export function reportStorageError(message) {
  status = { ...status, state: 'error', message: String(message || 'Save could not be written. Export your plan to keep a copy.') };
}

function storage() { try { return globalThis.localStorage; } catch { return null; } }
function textKey(text) {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 16777619); b = Math.imul(b, 33) ^ code;
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}-${text.length}`;
}
function remember(value, created) {
  const json = JSON.stringify(value);
  if (json === undefined) return null;
  const base = textKey(json);
  let key = base, suffix = 0;
  // Compare the content so a hash collision cannot overwrite another value.
  while (chunks.has(key) && chunks.get(key) !== json) key = `${base}-${++suffix}`;
  if (!chunks.has(key)) { chunks.set(key, json); created?.push(key); }
  return key;
}
function pack(value, type, created) {
  if (type !== 'save') return { value: remember(value, created) };
  const fields = {}, timeline = {};
  for (const [key, item] of Object.entries(value)) if (key !== 'timeline') fields[key] = remember(item, created);
  for (const [key, item] of Object.entries(value.timeline || {})) {
    if (item && !Array.isArray(item) && typeof item === 'object' &&
        ['nodes', 'snapshots', 'records', 'forecasts', 'actualPaths', 'forecastCatalog', 'catalog'].includes(key)) {
      timeline[key] = { entries: Object.fromEntries(Object.entries(item).map(([id, data]) => [id, remember(data, created)])) };
    } else timeline[key] = { value: remember(item, created) };
  }
  return { fields, timeline };
}
function unpack(packed, type) {
  const read = key => {
    if (key == null) return undefined;
    const json = chunks.get(key);
    if (json == null) throw new Error('A saved data record is missing. Import a plan backup to restore it.');
    return JSON.parse(json);
  };
  if (type !== 'save') return read(packed.value);
  const game = Object.fromEntries(Object.entries(packed.fields).map(([key, ref]) => [key, read(ref)]));
  game.timeline = Object.fromEntries(Object.entries(packed.timeline).map(([key, item]) => [key,
    item.entries ? Object.fromEntries(Object.entries(item.entries).map(([id, ref]) => [id, read(ref)])) : read(item.value)]));
  return game;
}
function chunkReferences(packed) {
  if (packed.value) return [packed.value];
  return [...Object.values(packed.fields), ...Object.values(packed.timeline).flatMap(item =>
    item.entries ? Object.values(item.entries) : [item.value])].filter(Boolean);
}
/** A failed/offline backend must not retain an unlimited queue in game memory. */
function checkPendingCapacity(key, record) {
  const proposed = new Map(pending); proposed.set(key, record);
  const refs = new Set();
  for (const item of proposed.values()) if (item?.packed)
    for (const ref of chunkReferences(item.packed)) if (!persistedChunks.has(ref)) refs.add(ref);
  let bytes = 0;
  for (const ref of refs) bytes += (chunks.get(ref)?.length || 0) * 2;
  if (proposed.size > MAX_PENDING_RECORDS || bytes > MAX_PENDING_BYTES)
    throw new Error('The session checkpoint buffer is full. Existing checkpoints are retained. Export your active plan, then retry browser storage before creating more checkpoints.');
}
function savedStatus() {
  status = { state: rejectedWrite ? 'error' : 'saved',
    message: rejectedWrite || 'Saved on this browser. Export JSON for a portable backup.', backend: 'indexedDB' };
}
function legacyList(key) {
  if (!storageSource) return [];
  try {
    const raw = storageSource.getItem(key);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) throw new Error('Expected a list of records.');
    return list;
  } catch {
    reportStorageError('An older browser save could not be read. Its localStorage data has been left unchanged.');
    return [];
  }
}
function readLegacy() {
  for (const [type, key, field] of [['save', SAVE_KEY, 'game'], ['profile', PROFILE_KEY, 'setup']]) {
    for (const entry of legacyList(key)) {
      if (!entry?.id || !entry[field] || (type === 'save' && !entry.game.portfolio)) continue;
      const recordKey = `${type}:${entry.id}`;
      if (records.has(recordKey)) continue;
      const { [field]: payload, ...metadata } = entry;
      const record = { key: recordKey, type, metadata, packed: pack(payload, type), legacy: true };
      records.set(recordKey, record); pending.set(recordKey, record);
    }
  }
}
function ensureSession() {
  const source = storage();
  if (storageSource === undefined) {
    storageSource = source; idbSource = globalThis.indexedDB; readLegacy();
  } else if (!db && !opening && source !== storageSource) {
    records.clear(); chunks.clear(); pending.clear(); persistedChunks.clear();
    rejectedWrite = null;
    storageSource = source; idbSource = globalThis.indexedDB;
    status = { state: 'idle', message: 'Save storage has not been opened.', backend: 'session' };
    readLegacy();
  }
}
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Browser storage request failed.'));
  });
}
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Browser save transaction failed.'));
  });
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = idbSource.open(DATABASE, 1);
    let finished = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('records')) database.createObjectStore('records', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('chunks')) database.createObjectStore('chunks', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      if (finished) { request.result.close(); return; }
      finished = true; resolve(request.result);
    };
    request.onerror = () => { finished = true; reject(request.error || new Error('Browser save storage could not open.')); };
    request.onblocked = () => { finished = true; reject(new Error('Close another game tab to open save storage.')); };
  });
}
function storageMessage(error) {
  const detail = error?.name === 'QuotaExceededError' ? 'Browser storage is full.' : (error?.message || 'Browser storage is unavailable.');
  return `${detail} Your current plan remains in this session. Export a JSON backup; saving can be retried.`;
}
async function persistPending() {
  if (!db || !pending.size) return;
  const batch = [...pending.entries()];
  const transaction = db.transaction(['records', 'chunks'], 'readwrite');
  const done = transactionDone(transaction);
  const recordStore = transaction.objectStore('records'), chunkStore = transaction.objectStore('chunks');
  const referenced = new Set();
  try {
    for (const [key, record] of batch) {
      // A tombstone prevents preserved legacy localStorage data from returning
      // after a deletion and reload.
      if (record == null) recordStore.put({ key, type: 'deleted', deleted: true });
      else {
        recordStore.put(record);
        for (const ref of chunkReferences(record.packed)) referenced.add(ref);
      }
    }
    for (const key of referenced) if (!persistedChunks.has(key)) chunkStore.put({ key, json: chunks.get(key) });
  } catch (error) {
    transaction.abort(); await done.catch(() => {}); throw error;
  }
  await done;
  for (const key of referenced) persistedChunks.add(key);
  for (const [key, record] of batch) if (pending.get(key) === record) pending.delete(key);
  if (batch.some(([, record]) => record == null)) await removeUnusedChunks();
}

/** Explicit deletions reclaim only data unreferenced by any durable checkpoint. */
async function removeUnusedChunks() {
  const transaction = db.transaction(['records', 'chunks'], 'readwrite');
  const done = transactionDone(transaction), removed = [];
  const recordRequest = transaction.objectStore('records').getAll();
  recordRequest.onerror = () => transaction.abort();
  recordRequest.onsuccess = () => {
    const durableRecords = recordRequest.result;
    const chunkStore = transaction.objectStore('chunks');
    const keysRequest = chunkStore.getAllKeys();
    keysRequest.onerror = () => transaction.abort();
    keysRequest.onsuccess = () => {
      const used = new Set();
      // Include current session changes that may be waiting behind this queue.
      for (const record of [...durableRecords, ...records.values()]) {
        if (!record.deleted && record.packed) for (const ref of chunkReferences(record.packed)) used.add(ref);
      }
      for (const key of keysRequest.result) if (!used.has(key)) {
        chunkStore.delete(key); removed.push(key);
      }
    };
  };
  await done;
  for (const key of removed) { persistedChunks.delete(key); chunks.delete(key); }
}

/** Open before the title menu. Failure is visible and never stops gameplay. */
export async function initializeSaves() {
  ensureSession();
  if (db) return getSaveStatus();
  if (opening) return opening;
  opening = (async () => {
    try {
      if (!idbSource) throw new Error('This browser does not provide durable IndexedDB storage.');
      db = await openDatabase();
      db.onversionchange = () => { db.close(); db = null; reportStorageError('Save storage changed in another tab. Reload after exporting your current plan.'); };
      const transaction = db.transaction(['records', 'chunks'], 'readonly');
      const done = transactionDone(transaction);
      const [savedRecords, savedChunks] = await Promise.all([
        requestResult(transaction.objectStore('records').getAll()),
        requestResult(transaction.objectStore('chunks').getAll()),
      ]);
      await done;
      for (const item of savedChunks) {
        if (chunks.has(item.key) && chunks.get(item.key) !== item.json) throw new Error('Saved data identifiers conflict.');
        chunks.set(item.key, item.json);
        persistedChunks.add(item.key);
      }
      for (const record of savedRecords) {
        const existing = records.get(record.key);
        // A new session action wins; a durable copy wins over legacy migration.
        if (!existing || existing.legacy) {
          records.set(record.key, record);
          if (pending.get(record.key) === existing) pending.delete(record.key);
        }
      }
      await persistPending();
      savedStatus();
    } catch (error) {
      if (db) { db.close(); db = null; }
      reportStorageError(rejectedWrite || storageMessage(error));
    }
    return getSaveStatus();
  })();
  const result = await opening; opening = null; return result;
}
function scheduleWrite() {
  status = { ...status, state: 'saving', message: 'Saving…' };
  queue = queue.then(async () => {
    await initializeSaves();
    if (!db) return;
    try {
      await persistPending();
      savedStatus();
    } catch (error) { reportStorageError(rejectedWrite || storageMessage(error)); }
  }).catch(error => reportStorageError(rejectedWrite || storageMessage(error)));
}
/** Explicit save/import/delete actions can await this; autosaves never block play. */
export async function flushSaves() {
  ensureSession();
  if (pending.size) scheduleWrite();
  await queue; return getSaveStatus();
}
export function listStoredRecords(type) {
  ensureSession();
  return [...records.values()].filter(record => record.type === type).map(record => ({ ...record.metadata }));
}
export function loadStoredRecord(type, id) {
  ensureSession();
  const record = records.get(`${type}:${id}`);
  if (!record || record.deleted) return null;
  try { return unpack(record.packed, type); }
  catch (error) { reportStorageError(error.message); return null; }
}
export function storeRecord(type, metadata, value) {
  ensureSession();
  const created = [];
  try {
    const key = `${type}:${metadata.id}`;
    const record = { key, type, metadata: { ...metadata }, packed: pack(value, type, created) };
    checkPendingCapacity(key, record);
    rejectedWrite = null;
    records.set(key, record); pending.set(key, record); scheduleWrite();
    return { ...metadata };
  } catch (error) {
    for (const key of created) chunks.delete(key);
    rejectedWrite = storageMessage(error); reportStorageError(rejectedWrite); return null;
  }
}
export function deleteStoredRecord(type, id) {
  ensureSession();
  const key = `${type}:${id}`;
  records.set(key, { key, type: 'deleted', deleted: true });
  pending.set(key, null); scheduleWrite();
}
/** Every checkpoint is retained until the player explicitly deletes it. */
export function autoSave(game, kind = 'begin') {
  try {
    const year = game.portfolio.year;
    const entry = {
      id: `${kind}-${year}-${Date.now()}-${++sequence}`,
      label: kind === 'import' ? `Imported ${year}` : kind === 'end' ? `End of ${year}` : `Begin of ${year}`,
      kind, year, age: game.portfolio.age, playerName: game.portfolio.playerName, ordinal: sequence,
      savedAt: new Date().toISOString(),
    };
    return storeRecord('save', entry, game);
  } catch (error) { reportStorageError(storageMessage(error)); return null; }
}
export function listSaves() {
  return listStoredRecords('save').sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || '') || (b.ordinal || 0) - (a.ordinal || 0) || String(b.id).localeCompare(String(a.id)));
}
export function loadSave(id) {
  const game = loadStoredRecord('save', id);
  if (!game) return null;
  try { return migrateGame(game); }
  catch { reportStorageError('This checkpoint could not be loaded. Keep its backup and choose another checkpoint.'); return null; }
}
export function deleteSave(id) { deleteStoredRecord('save', id); }
export function hasSaves() { return listStoredRecords('save').length > 0; }
