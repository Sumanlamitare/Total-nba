// An in-memory stand-in for MongoDB (local development and the interface tests, where no database server is
// available). Only the driver methods this app uses, with MongoDB's query, update and aggregation semantics from mingo.
// Never used in production: lib/db.js picks it only when ATN_MEMDB is set.
import { find, aggregate, updateOne as mUpdate } from 'mingo';
import { ObjectId } from 'mongodb';
import fs from 'node:fs';

const clone = v => structuredClone(v);
const now = () => new Date();

function cursor(get) {
  let sort = null, skip = 0, limit = 0, projection = null;
  const c = {
    sort(s) { sort = s; return c; }, skip(n) { skip = n; return c; }, limit(n) { limit = n; return c; }, project(p) { projection = p; return c; },
    async toArray() {
      let q = get(projection);
      if (sort) q = q.sort(sort);
      if (skip) q = q.skip(skip);
      if (limit) q = q.limit(limit);
      return clone(q.all());
    },
    async next() { const a = await c.toArray(); return a[0] || null; },
    [Symbol.asyncIterator]() { let a = null, i = 0; return { next: async () => { a ||= await c.toArray(); return i < a.length ? { value: a[i++], done: false } : { value: undefined, done: true }; } }; },
  };
  return c;
}

// Fields a filter fixes by equality (they seed an upserted document).
function seed(filter) {
  const o = {};
  for (const [k, v] of Object.entries(filter || {})) if (!k.startsWith('$') && (v === null || typeof v !== 'object' || v instanceof Date || v instanceof ObjectId || Array.isArray(v))) {
    const parts = k.split('.'); let t = o;
    for (const p of parts.slice(0, -1)) t = t[p] ||= {};
    t[parts.at(-1)] = v;
  }
  return o;
}

class Collection {
  constructor(store, name) { this.store = store; this.name = name; }
  get docs() { return this.store.data[this.name] ||= []; }
  async createIndex() { return 'ok'; }
  async createIndexes() { return []; }
  find(filter = {}, opts = {}) {
    const c = cursor(proj => find(this.docs, filter, proj || opts.projection || undefined));
    if (opts.sort) c.sort(opts.sort); if (opts.limit) c.limit(opts.limit); if (opts.skip) c.skip(opts.skip);
    return c;
  }
  async findOne(filter = {}, opts = {}) { return this.find(filter, opts).limit(1).next(); }
  async countDocuments(filter = {}, opts = {}) { const n = find(this.docs, filter).all().length; return opts.limit ? Math.min(n, opts.limit) : n; }
  async estimatedDocumentCount() { return this.docs.length; }
  async distinct(field, filter = {}) { return [...new Set(find(this.docs, filter).all().flatMap(d => [].concat(field.split('.').reduce((o, k) => o?.[k], d) ?? [])))]; }
  async insertOne(doc) {
    const d = clone(doc); d._id ??= new ObjectId();
    if (this.docs.some(x => String(x._id) === String(d._id))) throw Object.assign(new Error(`E11000 duplicate key ${d._id}`), { code: 11000 });
    this.docs.push(d); this.store.dirty(); return { insertedId: d._id, acknowledged: true };
  }
  async insertMany(docs) { const ids = []; for (const d of docs) ids.push((await this.insertOne(d)).insertedId); return { insertedCount: ids.length, insertedIds: ids }; }
  _update(filter, update, opts, many) {
    const hits = find(this.docs, filter).all();
    const targets = many ? hits : hits.slice(0, 1);
    if (Array.isArray(update)) throw new Error('memdb: pipeline updates are not supported');
    const { $setOnInsert, ...rest } = update;
    let modified = 0;
    for (const t of targets) {
      const i = this.docs.indexOf(t);
      const arr = [this.docs[i]];
      if (Object.keys(rest).length) { const r = mUpdate(arr, { _id: t._id }, rest); modified += r.modifiedCount; }
    }
    if (!targets.length && opts.upsert) {
      const d = { ...seed(filter) }; d._id ??= new ObjectId();
      const arr = [d];
      const ops = { ...rest, ...($setOnInsert ? { $set: { ...(rest.$set || {}), ...$setOnInsert } } : {}) };
      if (Object.keys(ops).length) mUpdate(arr, { _id: d._id }, ops);
      this.docs.push(arr[0]); this.store.dirty();
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: d._id, acknowledged: true };
    }
    if (modified) this.store.dirty();
    return { matchedCount: targets.length, modifiedCount: modified, upsertedCount: 0, acknowledged: true };
  }
  async updateOne(f, u, o = {}) { return this._update(f, u, o, false); }
  async updateMany(f, u, o = {}) { return this._update(f, u, o, true); }
  async replaceOne(filter, doc, opts = {}) {
    const t = find(this.docs, filter).all()[0];
    if (t) { const i = this.docs.indexOf(t); this.docs[i] = { ...clone(doc), _id: t._id }; this.store.dirty(); return { matchedCount: 1, modifiedCount: 1 }; }
    if (opts.upsert) { await this.insertOne({ ...seed(filter), ...doc }); return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }; }
    return { matchedCount: 0, modifiedCount: 0 };
  }
  async findOneAndUpdate(filter, update, opts = {}) {
    const before = find(this.docs, filter).all()[0];
    const prev = before ? clone(before) : null;
    const r = this._update(filter, update, opts, false);
    const after = before || (r.upsertedId ? this.docs.find(d => String(d._id) === String(r.upsertedId)) : null);
    return opts.returnDocument === 'after' ? (after ? clone(after) : null) : prev;
  }
  async deleteOne(filter) { const t = find(this.docs, filter).all()[0]; if (!t) return { deletedCount: 0 }; this.docs.splice(this.docs.indexOf(t), 1); this.store.dirty(); return { deletedCount: 1 }; }
  async deleteMany(filter = {}) { const hits = new Set(find(this.docs, filter).all()); const before = this.docs.length; this.store.data[this.name] = this.docs.filter(d => !hits.has(d)); this.store.dirty(); return { deletedCount: before - this.docs.length }; }
  aggregate(pipeline) {
    const self = this;
    return { async toArray() { return clone(aggregate(self.docs, pipeline)); } };
  }
  async bulkWrite(ops) {
    let n = 0;
    for (const op of ops) {
      if (op.updateOne) { await this.updateOne(op.updateOne.filter, op.updateOne.update, op.updateOne); n++; }
      else if (op.updateMany) { await this.updateMany(op.updateMany.filter, op.updateMany.update, op.updateMany); n++; }
      else if (op.replaceOne) { await this.replaceOne(op.replaceOne.filter, op.replaceOne.replacement, op.replaceOne); n++; }
      else if (op.insertOne) { await this.insertOne(op.insertOne.document); n++; }
      else if (op.deleteOne) { await this.deleteOne(op.deleteOne.filter); n++; }
      else if (op.deleteMany) { await this.deleteMany(op.deleteMany.filter); n++; }
    }
    return { ok: 1, n };
  }
  async drop() { delete this.store.data[this.name]; this.store.dirty(); return true; }
}

// ATN_MEMDB=path keeps the data in a JSON file between restarts (dates and ObjectIds survive the round trip).
export function memDb(file) {
  const revive = (k, v) => v && typeof v === 'object' && v.$date ? new Date(v.$date) : v && typeof v === 'object' && v.$oid ? new ObjectId(v.$oid) : v;
  const data = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8'), revive) : {};
  let timer = null;
  const store = {
    data,
    dirty() {
      if (!file || timer) return;
      timer = setTimeout(() => {
        timer = null;
        const json = JSON.stringify(data, function (k, v) { const raw = this[k]; return raw instanceof Date ? { $date: raw.toISOString() } : raw instanceof ObjectId ? { $oid: String(raw) } : v; });
        fs.writeFileSync(file, json);
      }, 300);
    },
  };
  const cols = new Map();
  return {
    collection: name => { if (!cols.has(name)) cols.set(name, new Collection(store, name)); return cols.get(name); },
    async dropDatabase() { for (const k of Object.keys(data)) delete data[k]; store.dirty(); },
    async stats() { return { dataSize: JSON.stringify(data).length }; },
    now,
  };
}
