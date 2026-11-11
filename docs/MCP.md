# MCP API Reference

Version: 0.6.0

This document describes all MCP tools exposed by `nodebb-plugin-integration`.

## 1. Overview

The plugin exposes a Model Context Protocol (MCP) server using Streamable HTTP transport.

Architecture:

```text
MCP client
    |
    | Streamable HTTP + Bearer token
    v
MCP child process
    |
    | Internal HTTP API + separate Bearer token
    v
NodeBB integration plugin
    |
    v
Native NodeBB APIs and permission checks
```

The MCP process runs separately from the NodeBB application process and is managed by the plugin.

All write operations use the NodeBB account configured as `mcpServiceUid`. MCP clients cannot select or override the acting user.

## 2. Configuration

Configure MCP in NodeBB ACP → Plugins → NodeBB Integration.

| Setting | Description |
|---|---|
| Enable MCP | Enables or disables the MCP server |
| Bind address | Network interface used by the MCP HTTP server |
| Port | MCP HTTP port |
| NodeBB URL | URL used by the MCP process to reach NodeBB |
| Bearer token | Secret required by MCP clients |
| Service user UID | NodeBB account used for permission checks and write operations | . Required; must be a positive integer. 

Default values:

- Bind address: `127.0.0.1`
- Port: `3100`
- NodeBB URL: `http://127.0.0.1:4567`

The plugin generates and stores a separate internal API token automatically.

The external MCP Bearer token and internal API token are different secrets.

Do not expose the internal API token to MCP clients.

## 3. Authentication and permissions

MCP clients authenticate with:

```http
Authorization: Bearer YOUR_MCP_TOKEN
```

The MCP child process authenticates its requests to NodeBB using the separate internal API token.

The internal API rejects requests when MCP is disabled or the internal token is invalid.

### Acting user

The configured `mcpServiceUid` is used for:

- Reading posts and topics with permission checks.
- Semantic search access filtering.
- Listing topics and posts.
- Creating topics and replies.
- Editing, deleting and restoring posts.
- Deleting and restoring topics.
- Bulk deletion of a user's replies.

The `uid` argument of `delete_user_posts` identifies the target account whose replies are processed. It does not identify the acting account.

### NodeBB permissions

Write operations use native NodeBB methods. Native permission checks, restrictions and hooks are preserved.

Examples include:

- Category permissions for topic creation.
- Topic reply permissions and topic lock restrictions.
- Post edit permissions and edit restrictions.
- Post and topic delete/restore permissions.
- NodeBB hooks associated with these operations.

Read operations that return post or topic content apply NodeBB access checks.

`get_user` returns public profile fields and does not expose private account data.

Access-check failures deny access.

## 4. Common argument rules

- IDs must be positive safe integers.
- Pagination offsets must be non-negative integers.
- Unknown arguments are rejected.
- Additional properties are rejected.
- Text arguments must not be empty or whitespace-only.
- Text length limits are measured in JavaScript string characters.
- Tool arguments must be JSON objects.

The MCP server returns tool results as formatted JSON text. Errors are returned as MCP tool results with `isError: true`.

## 5. Tool reference

### 5.1 get_forum_info

Returns public forum information.

Arguments: none.

Example:

```json
{}
```

Response fields:

| Field | Type | Description |
|---|---|---|
| title | string | Forum title |
| url | string | Forum URL |
| version | string | NodeBB version |
| language | string or null | Forum language |

Example:

```json
{
  "title": "Example Forum",
  "url": "https://forum.example.com",
  "version": "4.16.7",
  "language": "en-GB"
}
```

### 5.2 get_post

Retrieves a post by ID after checking whether the configured service user can read both the post and its topic.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| pid | integer | Yes | Minimum 1 |

Example:

```json
{
  "pid": 123
}
```

Response:

| Field | Type | Description |
|---|---|---|
| pid | integer | Post ID |
| tid | integer | Topic ID |
| uid | integer | Author UID |
| cid | integer | Category ID |
| content | string | Post content |
| timestamp | NodeBB timestamp | Post creation timestamp |

Deleted posts, missing posts and posts inaccessible to the service user are reported as not found.

### 5.3 get_topic

Retrieves topic metadata after checking topic read permissions.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| tid | integer | Yes | Minimum 1 |

Example:

```json
{
  "tid": 42
}
```

Response:

| Field | Type | Description |
|---|---|---|
| tid | integer | Topic ID |
| uid | integer | Topic author UID |
| title | string | Topic title |
| cid | integer | Category ID |
| timestamp | NodeBB timestamp | Topic creation timestamp |
| mainPid | integer | ID of the first post |

The tool returns topic metadata, not the complete list of posts. Use `list_posts` to retrieve posts.

### 5.4 get_user

Returns public profile information for a user.

The `uid` argument identifies the user whose public profile is requested. It does not change the service user or determine which account performs operations.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| uid | integer | Yes | Minimum 1 |

Example:

```json
{
  "uid": 7
}
```

Response:

| Field | Type | Description |
|---|---|---|
| uid | integer | User ID |
| username | string | Username |
| userslug | string | URL-safe username |
| picture | string | Profile picture URL or value provided by NodeBB |

Only the fields listed above are returned.

### 5.5 search_knowledge

Performs semantic search against the indexed forum knowledge base.

Requires the OpenAI provider and a working Qdrant collection.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| query | string | Yes | 1–2000 characters |
| limit | integer | No | 1–20; default 5 |

Example:

```json
{
  "query": "How do I configure forum notifications?",
  "limit": 5
}
```

Response:

```json
{
  "results": [
    {
      "pid": 123,
      "tid": 42,
      "uid": 7,
      "cid": 3,
      "score": 0.91,
      "content": "Post content..."
    }
  ]
}
```

Result fields:

| Field | Type | Description |
|---|---|---|
| pid | integer | Post ID |
| tid | integer | Topic ID |
| uid | integer | Author UID |
| cid | integer | Category ID |
| score | number | Semantic similarity score from the vector search |
| content | string | Post content retrieved from NodeBB |

Search behavior:

1. Generates an embedding for the query.
2. Searches Qdrant for candidate posts.
3. Checks candidate category exclusions.
4. Checks post and topic read permissions for the service user.
5. Retrieves permitted post content from NodeBB.
6. Returns at most the requested number of valid results.

The implementation may retrieve more candidates than the requested limit to compensate for permission filtering.

In Fake AI mode, the tool returns an AI-disabled error. It does not perform semantic search.

### 5.6 create_topic

Creates a topic in a NodeBB category as the configured service user.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| cid | integer | Yes | Minimum 1 |
| title | string | Yes | 1–255 characters |
| content | string | Yes | 1–20000 characters |
| tags | array of strings | No | Maximum 10 tags; each 1–32 characters |

Example:

```json
{
  "cid": 3,
  "title": "New discussion",
  "content": "The opening post content.",
  "tags": ["discussion", "help"]
}
```

If `tags` is omitted, an empty array is used.

The title is trimmed before submission. Content is passed to NodeBB without trimming.

NodeBB performs category permission checks, posting restrictions, tag validation and native creation hooks.

The response is the result returned by the native NodeBB topic creation method.

### 5.7 delete_topic

Soft-deletes a topic using native NodeBB permissions and hooks.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| tid | integer | Yes | Minimum 1 |

Example:

```json
{
  "tid": 42
}
```

This is a soft-delete operation, not permanent deletion.

The response is the native NodeBB operation result.

### 5.8 restore_topic

Restores a previously soft-deleted topic.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| tid | integer | Yes | Minimum 1 |

Example:

```json
{
  "tid": 42
}
```

NodeBB checks the acting user's permissions and executes its native restore hooks.

Restoring a topic does not automatically restore posts that were separately deleted.

The response is the native NodeBB operation result.

### 5.9 list_topics

Lists topics visible to the configured service user.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| start | integer | No | 0–10000000; default 0 |
| limit | integer | No | 1–100; default 20 |
| sort | string | No | One of the supported values; default `recent` |
| cid | integer | No | Minimum 1; optional category filter |

Supported sort values:

| Value | Description |
|---|---|
| recent | Recent activity |
| old | Older topics |
| create | Creation ordering |
| posts | Post-count ordering |
| votes | Vote ordering |
| views | View-count ordering |

Example:

```json
{
  "start": 0,
  "limit": 20,
  "sort": "recent",
  "cid": 3
}
```

Response contains the native NodeBB topic listing result and pagination metadata:

| Field | Type | Description |
|---|---|---|
| topics | array | Topic records returned by NodeBB |
| topicCount | integer | Total count reported by NodeBB |
| nextStart | integer | Suggested offset for the next request |
| hasMore | boolean | `hasMore` is an indication of possible additional results based on NodeBB's total count. It does not guarantee that the next request will return a non-empty page. |

The exact topic record fields are provided by the installed NodeBB version.
### 5.10 create_post

Creates a reply in an existing topic.

This tool creates a reply, not a new topic or a replacement for the topic's first post.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| tid | integer | Yes | Minimum 1 |
| content | string | Yes | 1–20000 characters |

Example:

```json
{
  "tid": 42,
  "content": "This is a reply."
}
```

The reply is created as the configured service user.

NodeBB checks reply permissions, topic state, category permissions and native posting restrictions.

The response is the native NodeBB reply creation result.

### 5.11 edit_post

Edits an existing post.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| pid | integer | Yes | Minimum 1 |
| content | string | Yes | 1–20000 characters |

Example:

```json
{
  "pid": 123,
  "content": "Updated post content."
}
```

The configured service user is the acting user.

NodeBB applies native edit permissions and restrictions. Native hooks and edit history behavior are preserved.

The response is the native NodeBB edit result.

### 5.12 delete_post

Soft-deletes a post.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| pid | integer | Yes | Minimum 1 |

Example:

```json
{
  "pid": 123
}
```

NodeBB applies native post deletion permissions and hooks.

This is not permanent deletion. No purge operation is invoked.

The response is the native NodeBB delete result.

### 5.13 restore_post

Restores a soft-deleted post.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| pid | integer | Yes | Minimum 1 |

Example:

```json
{
  "pid": 123
}
```

NodeBB applies native restore permissions and hooks.

The response is the native NodeBB restore result.

### 5.14 delete_user_posts

Soft-deletes replies authored by a specified user.

The first post of every topic is always skipped. The tool does not delete topic main posts.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| uid | integer | Yes | Target user UID; minimum 1 |
| start | integer | No | 0–10000000; default 0 |
| limit | integer | No | 1–100; default 100 |

Example:

```json
{
  "uid": 25,
  "start": 0,
  "limit": 100
}
```

The configured service user performs the deletion. The supplied `uid` identifies the target author only.

The operation processes posts sequentially and continues after individual deletion failures.

Errors from individual deletion operations are included in the `failed` array. Such errors do not, by themselves, stop processing of the remaining posts or mean that the entire tool call has failed.

Posts are skipped when they are invalid, missing, already deleted, no longer belong to the target user, or are the main post of a topic.

Response:

| Field | Type | Description |
|---|---|---|
| uid | integer | Target user UID |
| scanned | integer | Number of IDs returned by the current page |
| deleted | integer | Number of successfully soft-deleted replies |
| skipped | integer | Number of posts skipped |
| failed | array | Individual deletion failures |
| hasMore | boolean | Whether the returned ID page filled the requested limit |
| nextStart | integer | Suggested offset for the next batch |

Each `failed` entry contains:

```json
{
  "pid": 123,
  "error": "Permission denied"
}
```

Example response:

```json
{
  "uid": 25,
  "scanned": 100,
  "deleted": 85,
  "skipped": 10,
  "failed": [
    {
      "pid": 456,
      "error": "Permission denied"
    }
  ],
  "hasMore": true,
  "nextStart": 15
}
```

The example is illustrative; actual counts depend on the returned IDs and operation results.

#### Batch processing

Use `nextStart` from the previous response as the next request's `start`:

```json
{
  "uid": 25,
  "start": 15,
  "limit": 100
}
```

Successful deletions are removed from the user's active post listing. The implementation adjusts `nextStart` by subtracting the number of successfully deleted posts to avoid skipping remaining replies.

`hasMore` is based on whether the current ID page contains the full requested number of IDs. It is a pagination hint; an additional request may return an empty page.

This operation is not a permanent purge. Topic main posts are never deleted by this tool.

### 5.15 list_posts

Lists posts in a topic, using NodeBB access filtering and pagination.

Arguments:

| Name | Type | Required | Constraints |
|---|---|---|---|
| tid | integer | Yes | Minimum 1 |
| start | integer | No | 0–10000000; default 0 |
| limit | integer | No | 1–100; default 20 |
| reverse | boolean | No | Default false |

Example:

```json
{
  "tid": 42,
  "start": 0,
  "limit": 20,
  "reverse": false
}
```

Response:

| Field | Type | Description |
|---|---|---|
| tid | integer | Topic ID |
| start | integer | Requested offset |
| limit | integer | Requested page size |
| reverse | boolean | Reverse ordering flag |
| posts | array | NodeBB post records returned for the topic |
| total | integer | Topic post count reported by NodeBB |
| nextStart | integer | Suggested next offset |
| hasMore | boolean | `hasMore` is an indication of possible additional results based on NodeBB's total count. It does not guarantee that the next request will return a non-empty page. |

Post record fields are provided by the installed NodeBB version.

The service user's topic read permission is checked before the post list is retrieved. Deleted or inaccessible topics are not returned.
## 6. Pagination

The listing tools use zero-based offsets.

| Tool | Default start | Default limit | Maximum limit |
|---|---:|---:|---:|
| list_topics | 0 | 20 | 100 |
| list_posts | 0 | 20 | 100 |
| delete_user_posts | 0 | 100 | 100 |

For listing tools, use the returned `nextStart` for the next request when `hasMore` is true.

For bulk deletion, always use the returned `nextStart`, because successful deletions change the active post list.

## 7. Errors

The MCP server returns execution errors as text with `isError: true`.

Common error situations:

| Situation | Behavior |
|---|---|
| Invalid arguments | Tool validation error |
| Unknown or extra argument | Rejected |
| Invalid ID | Rejected |
| MCP disabled | Internal API rejects the request |
| Invalid internal token | Internal API returns unauthorized |
| Missing or inaccessible post/topic | Reported as not found for protected reads |
| NodeBB permission failure | Native NodeBB operation error |
| AI provider disabled | Semantic search unavailable |
| Internal operation failure | Tool returns an error |

For `search_knowledge`, AI-disabled mode is an explicit error. Other search infrastructure failures are also reported as errors.

Bulk deletion is different from single-item operations: individual failures are collected in `failed`, and processing continues with subsequent IDs.

## 8. Safety and operational notes

- Use a dedicated NodeBB service account with only the permissions required for the intended operations.
- Do not expose the MCP internal API token.
- Bind to `127.0.0.1` unless remote access is intentionally required.
- Use a secure network path when exposing MCP remotely.
- Deletion tools perform soft deletion, not permanent purge.
- `delete_user_posts` skips topic main posts.
- Restoring a topic does not restore separately deleted posts.
- Semantic search returns only posts accessible to the configured service user.
- The plugin does not trust a client-supplied acting UID.

## 9. Compatibility

The plugin targets NodeBB 4.x and requires Node.js >= 22.

The 0.6.0 implementation was checked against NodeBB 4.16.7.

Native NodeBB response fields may vary between NodeBB versions. The plugin uses native NodeBB methods for creation, editing, deletion, restoration and listing.

## 10. Related documentation

- [Project README](../README.md)
- [Русская документация MCP](MCP.ru.md)
- [Русский README](../README.ru.md)
