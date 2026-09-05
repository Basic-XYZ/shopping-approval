'use strict';

function createStore(db) {
  function access(database) {
    return {
      async get(collection, id) {
        const response = await database.collection(collection).doc(id).get();
        return response.data || null;
      },
      async set(collection, id, value) {
        const { _id, ...data } = value;
        await database.collection(collection).doc(id).set({ data });
      }
    };
  }
  return {
    async transaction(callback) {
      return db.runTransaction((tx) => callback(access(tx)));
    },
    async list(collection, filter, offset, limit) {
      const where = Object.fromEntries(Object.entries(filter).map(([key, value]) =>
        [key, value && value.in ? db.command.in(value.in) : value]));
      const result = await db.collection(collection).where(where).orderBy('createdAt', 'desc')
        .orderBy('_id', 'desc').skip(offset).limit(limit).get();
      return result.data;
    }
  };
}
module.exports = { createStore };
