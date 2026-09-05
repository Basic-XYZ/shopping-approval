'use strict';
const clone = (value) => value === undefined ? null : structuredClone(value);
function memoryStore() {
  let state = {};
  let tail = Promise.resolve();
  let failWrite = 0;
  return {
    failAfterWrites(n) { failWrite = n; },
    snapshot() { return clone(state); },
    transaction(callback) {
      const run = tail.then(async () => {
        const next = clone(state);
        let writes = 0;
        const result = await callback({
          async get(collection, id) { return clone((next[collection] || {})[id]); },
          async set(collection, id, value) {
            writes += 1;
            if (failWrite && writes === failWrite) { failWrite = 0; throw new Error('injected write failure'); }
            if (!next[collection]) next[collection] = {};
            next[collection][id] = clone({ ...value, _id: id });
          }
        });
        state = next;
        return clone(result);
      });
      tail = run.catch(() => {});
      return run;
    },
    async list(collection, where, offset, limit) {
      return Object.values(state[collection] || {}).filter((row) => Object.entries(where).every(([key, val]) =>
        val && val.in ? val.in.includes(row[key]) : row[key] === val))
        .sort((a, b) => b.createdAt - a.createdAt || b._id.localeCompare(a._id)).slice(offset, offset + limit).map(clone);
    }
  };
}
module.exports = { memoryStore };
