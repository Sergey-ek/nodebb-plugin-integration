# MCP API Reference

Version: 0.6.2

## 1. Overview

The plugin exposes NodeBB functionality through the Model Context Protocol (MCP) using Streamable HTTP transport.

The MCP endpoint is:

```text
/mcp
```

The MCP server runs as a separate child process managed by the NodeBB plugin. It communicates with NodeBB through an internal HTTP API protected by a separate automatically generated authentication token.

The plugin supports two MCP client authentication modes:

- **OAuth 2.0** — the default mode. Each client authorizes a specific NodeBB user and operates with that user's permissions.
- **Legacy Bearer Token** — a backward-compatible mode in which all clients share one static token and operate as a configured NodeBB service user.

Architecture:

```text
MCP client
    |
    | Streamable HTTP
    | OAuth access token OR legacy Bearer token
    v
MCP child process
    |
    | Internal HTTP API
    | Separate internal authentication token
    v
NodeBB integration plugin
    |
    | User-scoped NodeBB API calls
    | Native permission checks
    v
NodeBB
```

The plugin provides 15 MCP tools for forum information, reading, searching and content management.

All operations are subject to NodeBB permissions for the acting user.

The `search_knowledge` tool additionally requires the OpenAI provider and a configured Qdrant instance.

## 2. Configuration

MCP configuration is managed through:

**NodeBB ACP → Plugins → NodeBB Integration**

| Setting | Description |
|---|---|
| Enable MCP | Enables or disables the MCP server |
| Authentication mode | OAuth 2.0 or Legacy Bearer Token |
| Bind address | Network interface on which the MCP HTTP server listens |
| Port | MCP HTTP port |
| NodeBB URL | Internal URL used by the MCP process to reach NodeBB |
| Bearer token | Shared client authentication token; used only in Legacy Bearer mode |
| Service user UID | NodeBB account used for MCP operations; used only in Legacy Bearer mode |

Default connection settings:

```text
Bind address: 127.0.0.1
Port:         3100
NodeBB URL:   http://127.0.0.1:4567
```

The default bind address restricts the MCP listener to localhost. Change it only when remote access is intentionally required and the network exposure is secured.

When exposing MCP through a reverse proxy, publish the external `/mcp` endpoint over HTTPS.

The plugin automatically generates a separate random token for its internal API. This token is used only between the MCP child process and the NodeBB plugin. It is distinct from MCP client credentials and must never be shared with MCP clients.

### Authentication mode

OAuth 2.0 is the default authentication mode.

In OAuth mode:

- Each MCP client authorizes an individual NodeBB user.
- MCP operations use the UID of the authenticated user.
- NodeBB permissions are checked for that user.
- The shared MCP Bearer token and Service user UID settings are not used.

Legacy Bearer Token mode is available for backward compatibility.

In Legacy Bearer mode:

- All MCP clients use the same configured static Bearer token.
- MCP operations use the configured Service user UID.
- NodeBB permissions are checked for that service user.

The Service user UID must identify a valid NodeBB user when Legacy Bearer mode is used.

## 3. Authentication and permissions

### 3.1. OAuth 2.0

OAuth 2.0 is the default authentication mode.

The plugin implements the OAuth 2.0 Authorization Code flow with PKCE using the `S256` code challenge method.

MCP clients are public clients and do not use a client secret.

#### Authorization server metadata

The OAuth authorization server metadata is published at:

```text
https://forum.example.com/.well-known/oauth-authorization-server
```

The metadata advertises these endpoints:

| Endpoint | Path |
|---|---|
| Authorization | `/oauth/authorize` |
| Token | `/oauth/token` |
| Token revocation | `/oauth/revoke` |
| Authorization server metadata | `/.well-known/oauth-authorization-server` |

The supported scope is:

```text
mcp
```

The server supports the following grant types:

- `authorization_code`
- `refresh_token`

The token endpoint authentication method is `none`, because MCP clients are public clients.

PKCE with `S256` is required.

#### Client identification and metadata

The plugin supports Client ID Metadata Documents (CIMD).

A client identifies itself using an HTTPS URL as its `client_id`. The URL points to a metadata document describing the OAuth client.

The metadata document must satisfy the following requirements:

- `client_id` must match the metadata document URL.
- `client_name` is required.
- `redirect_uris` must contain between 1 and 20 valid redirect URIs.
- Redirect URIs must use HTTPS or an allowed HTTP loopback address.
- HTTP loopback redirects are permitted for native applications using `localhost`, `127.0.0.1` or `[::1]`.
- `client_secret` must not be provided.
- `token_endpoint_auth_method` must be `none`.
- `response_types` must contain `code`.
- `grant_types` must include `authorization_code`. `refresh_token` is also supported.

The metadata document is retrieved over HTTPS.

For security, the metadata fetcher:

- Rejects IP-literal hostnames.
- Resolves the hostname and requires public unicast IP addresses.
- Pins the validated DNS lookup to the connection to mitigate DNS rebinding.
- Verifies TLS certificates.
- Uses a five-second timeout.
- Limits the response body to 64 KiB.
- Requires an HTTP 200 response and JSON content type.

#### User consent and client authorization

When a user connects a new OAuth client:

1. The plugin retrieves and validates the client's metadata document.
2. The user authenticates with NodeBB.
3. NodeBB displays an explicit consent screen.
4. After the user approves access, the client is automatically authorized for that user.

A previously approved client does not require consent again while its authorization grant and client metadata remain valid. If the grant is revoked or the client's metadata changes, the user must approve authorization again.

A new client requires explicit user approval.

Each authorized client is associated with the NodeBB user who granted access. MCP operations use that user's UID and permissions.

#### Token lifetime and refresh

OAuth tokens are opaque values. Token hashes are stored in Redis rather than the original token values.

| Token | Lifetime |
|---|---|
| Authorization code | 5 minutes |
| Access token | 15 minutes |
| Refresh token | 30 days |

Refresh tokens are rotated when used.

The plugin tracks refresh token families and detects reuse of previously rotated refresh tokens. Detected replay results in revocation of the affected refresh token family.

#### Managing access and revoking clients

Users can manage MCP access from their NodeBB account page:

```text
/user/<userslug>/integration
```

The account page allows users to:

- Enable or disable MCP access globally.
- View authorized MCP clients.
- Revoke an individual client's authorization.

Disabling global MCP access invalidates existing OAuth tokens.

Enabling access again does not restore previously invalidated tokens. Clients must authorize again.

The OAuth token revocation endpoint is:

```text
POST /oauth/revoke
```

### 3.2. Legacy Bearer Token

Legacy Bearer Token mode is provided for backward compatibility.

Clients authenticate by sending the configured shared token in the HTTP Authorization header:

```http
Authorization: Bearer YOUR_MCP_TOKEN
```

All clients using this token operate as the NodeBB user configured by the Service user UID setting.

The service user's NodeBB permissions determine which operations are allowed.

Use this mode only when compatibility with an existing Bearer-token integration is required.

### 3.3. Internal API authentication

The MCP child process communicates with the NodeBB plugin through a private internal HTTP API.

This API uses a separate automatically generated authentication token.

The internal token:

- Is distinct from OAuth access tokens and the legacy MCP Bearer token.
- Is used only for communication between the MCP child process and the NodeBB plugin.
- Must never be shared with external MCP clients.

Internal API routes require authentication and are disabled when MCP is disabled.

In OAuth mode, the authenticated user's identity is validated by the plugin before MCP operations are executed.

### 3.4. Acting user and permissions

The acting user depends on the configured authentication mode:

| Authentication mode | Acting user |
|---|---|
| OAuth 2.0 | NodeBB user who authorized the MCP client |
| Legacy Bearer Token | NodeBB user configured by Service user UID |

Read and write operations use NodeBB's native APIs and permission checks.

The client cannot override the acting user's UID.

The `uid` argument of `delete_user_posts` identifies the target account whose posts are to be deleted. It does not change the acting user.

### 3.5. Read access and privacy

Read operations apply NodeBB access checks.

A user can retrieve only content that the acting account is permitted to access.

Semantic search results are also filtered using the acting user's permissions. Vector similarity alone does not grant access to a post or topic.

The plugin validates retrieved post metadata against NodeBB before returning post content.

The `get_user` tool returns only the selected public profile fields. It does not expose private account information.

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
  "version": "4.16.8",
  "language": "en-GB"
}
```

### 5.2 get_post

Retrieves a post by ID after checking whether the acting user can read both the post and its topic.

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

Deleted posts, missing posts and posts inaccessible to the acting user are reported as not found.

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

The `uid` argument identifies the user whose public profile is requested. It does not change the acting user or determine which account performs operations.

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
4. Checks post and topic read permissions for the acting user.
5. Retrieves permitted post content from NodeBB.
6. Returns at most the requested number of valid results.

The implementation may retrieve more candidates than the requested limit to compensate for permission filtering.

In Fake AI mode, the tool returns an AI-disabled error. It does not perform semantic search.

### 5.6 create_topic

Creates a topic in a NodeBB category as the acting user.

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

Lists topics visible to the acting user.

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

The reply is created as the acting user.

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

The operation is performed with the acting user's permissions.

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

The acting user performs the deletion. The supplied `uid` identifies the target author only.

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

The acting user's topic read permission is checked before the post list is retrieved. Deleted or inaccessible topics are not returned.

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
- Semantic search returns only posts accessible to the acting user.
- The plugin does not trust a client-supplied acting UID.

## 9. Compatibility

The plugin targets NodeBB 4.x and requires Node.js >= 22.

The 0.6.2 implementation was checked against NodeBB 4.16.8.

Native NodeBB response fields may vary between NodeBB versions. The plugin uses native NodeBB methods for creation, editing, deletion, restoration and listing.

## 10. Related documentation

- [Project README](../README.md)
- [Русская документация MCP](MCP.ru.md)
- [Русский README](../README.ru.md)
