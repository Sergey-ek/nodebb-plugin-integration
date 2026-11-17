# OAuth storage adapters — TODO

The Redis adapter is the first implementation.
MongoDB and PostgreSQL adapters are intentionally deferred.

All adapters must implement the contract in `index.js` with identical
semantics and atomicity guarantees.

## MongoDB adapter (`mongo.js`)

- Use the initialized NodeBB `database.client` (MongoDB Db instance).
- Create separate collections for authorization codes, access tokens,
  and refresh-token families.
- Add unique indexes for token hashes and family IDs.
- Consume authorization codes atomically with `findOneAndDelete`.
- Implement refresh rotation as an atomic single-document operation.
- Detect reuse of previously rotated refresh tokens and revoke the family.
- Add TTL indexes for automatic cleanup.
- Independently check expiration during reads; MongoDB TTL cleanup is
  asynchronous and is not an authorization check.
- Verify compatibility with the MongoDB driver version bundled with NodeBB.
- Add integration tests against a real MongoDB instance.

## PostgreSQL adapter (`postgres.js`)

- Use the initialized NodeBB `database.pool`.
- Create tables for authorization codes, access tokens,
  and refresh-token families.
- Add primary keys, unique constraints, and indexes for token hashes
  and expiration timestamps.
- Consume authorization codes atomically with `DELETE ... RETURNING`.
- Rotate refresh tokens in a transaction using `SELECT ... FOR UPDATE`
  and an update in the same transaction.
- Revoke the family on refresh-token reuse in that transaction.
- Add periodic cleanup for expired records; PostgreSQL has no built-in
  TTL deletion mechanism equivalent to Redis.
- Add integration tests against a real PostgreSQL instance.

## Requirements for every adapter

- Store SHA-256 token hashes only; never store raw tokens.
- Preserve the original refresh-family expiration during rotation.
- Authorization-code consumption must be atomic and one-time.
- Refresh rotation and reuse detection must be atomic.
- Match the Redis adapter's return values and error semantics.
- Never implement atomic operations as a separate read followed by delete.
- Test concurrent requests, expired records, duplicate creation,
  token reuse, revocation, and expiration boundaries.
