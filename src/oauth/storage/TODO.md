# OAuth storage adapters — status

## Redis

- Implemented and verified.
- Uses the initialized NodeBB Redis client.
- Atomic operations implemented with Lua scripts.
- Serves as the behavioral reference for other adapters.

## MongoDB

- Adapter implemented in `mongo.js`.
- Uses the initialized NodeBB MongoDB Db instance.
- Uses separate collections for authorization codes, access tokens,
  refresh families, and user access/grants/consents.
- TTL indexes implemented for authorization codes, access tokens,
  and refresh families.
- Consent transactions are embedded in user documents and do not have
  automatic TTL cleanup.
- Expired consent records are cleaned opportunistically for the current
  user and for duplicate transaction IDs.
- Atomic single-document operations implemented.
- Factory integration and storage contract tests pass.
- Real MongoDB integration tests are pending.
- Do not consider production behavior verified until integration tests pass.

## PostgreSQL

- Adapter implemented in `postgres.js`.
- Uses the initialized NodeBB `database.pool`.
- Schema is initialized lazily.
- Uses separate tables for authorization codes, access tokens,
  refresh families, user access, client grants, and consent transactions.
- Authorization-code consumption uses DELETE ... RETURNING.
- Refresh rotation uses a transaction and SELECT ... FOR UPDATE.
- Refresh-token reuse revokes the family.
- Consent approval uses a transaction and row locks.
- Expiration is checked during reads and mutations.
- Expired records are removed opportunistically only when creating
  a record with the same ID; there is no global cleanup mechanism.
- Factory integration and storage contract tests pass.
- Real PostgreSQL integration tests are pending.
- Do not consider production behavior verified until integration tests pass.

## Cross-adapter audit — pending

- Add shared behavioral contract tests for grants and user access.
- Cover grant creation, updates, revocation, repeated revocation,
  version increments, and concurrent operations.
- Cover edge cases involving missing enabled/version fields.
- Compare createdAt handling for null, false, zero, and empty string.
- Verify behavior against the Redis adapter before changing MongoDB
  or PostgreSQL implementations.
- Review whether PostgreSQL index oauth_grants_uid_idx is redundant
  with the primary key (uid, client_hash).
- Consider bounded periodic cleanup for expired PostgreSQL records.
- Consider cleanup for expired MongoDB consent entries embedded in users.
- Do not claim MongoDB or PostgreSQL behavior is verified until
  real database integration tests pass.

## Requirements for every adapter

- Store SHA-256 token hashes only; never store raw tokens.
- Preserve the original refresh-family expiration during rotation.
- Authorization-code consumption must be atomic and one-time.
- Refresh rotation and reuse detection must be atomic.
- Match Redis return values and error semantics.
- Test concurrent requests, expired records, duplicate creation,
  token reuse, revocation, and expiration boundaries.
