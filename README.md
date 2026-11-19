# NodeBB Integration

AI and MCP integration layer for NodeBB.

The plugin connects NodeBB to AI-powered semantic search and exposes forum functionality to external AI clients through the Model Context Protocol (MCP).

**Translations:** [Русский](README.ru.md) · [简体中文](README.zh-CN.md)

- **Version:** 0.6.2
- **License:** MIT
- **NodeBB:** 4.x
- **Node.js:** >= 22

## Features

- MCP server using Streamable HTTP transport.
- Separate MCP child process managed by the plugin.
- OAuth 2.0 authentication for MCP clients using Authorization Code + PKCE (`S256`).
- CIMD (Client ID Metadata Documents) support for public OAuth clients.
- Explicit per-user consent and MCP access management.
- Legacy static Bearer-token authentication for backward compatibility.
- Separate authentication token for the internal NodeBB API.
- Configurable MCP bind address, port and authentication mode.
- 15 MCP tools for forum information, reading, searching and content management.
- OpenAI embedding generation and semantic search.
- Qdrant vector database integration.
- Permission-aware retrieval: search results are filtered using NodeBB access permissions.
- Individual post indexing and category exclusions.
- OpenAI and Fake AI provider modes.
- NodeBB ACP configuration interface.
- Automated tests for API handlers and MCP tools.

## Requirements

- Node.js >= 22.
- npm >= 10.
- NodeBB 4.x.
- A running NodeBB instance.

Additional services are required for AI semantic search:

- An OpenAI API key.
- A reachable Qdrant instance and collection configured for the plugin's embedding model.

MCP tools that do not depend on semantic search can be used independently of the OpenAI and Qdrant configuration. The `search_knowledge` tool requires the OpenAI provider and Qdrant.

## Installation

Install the plugin using the NodeBB administration interface or the standard NodeBB plugin installation procedure.

For a manual installation:

```bash
cd /path/to/nodebb
npm install nodebb-plugin-integration
```

Build and restart NodeBB using the standard procedure for your installation.

After installation, open:

**NodeBB ACP → Plugins → NodeBB Integration**

Configure the required options and save the settings.

## Configuration

The plugin configuration is managed through the NodeBB ACP.

### AI provider

The plugin supports two provider modes:

- **OpenAI** — enables embeddings and semantic search.
- **Fake** — disables calls to the OpenAI service. Semantic search is unavailable in this mode.

For semantic search, configure the OpenAI API key, embedding settings and Qdrant connection according to your deployment.

Default embedding configuration:

| Setting | Default |
|---|---|
| Embedding model | `text-embedding-3-small` |
| Embedding dimensions | `1536` |
| Qdrant collection | `nodebb_knowledge` |

### Search and indexing

The plugin uses embeddings to index forum content and Qdrant to store and retrieve vectors.

Search results are not returned solely on the basis of vector similarity. Before returning a result, the plugin checks whether the authenticated OAuth user or the configured legacy service user can read the corresponding post and topic.

Excluded Categories allows selected categories to be omitted from semantic search.

The plugin validates retrieved post metadata against NodeBB before returning post content. Qdrant is used as the vector index; NodeBB remains the source of post content and access permissions.

## MCP server

MCP settings are managed through:

**NodeBB ACP → Plugins → NodeBB Integration**

| Setting | Description |
|---|---|
| Enable MCP | Enables or disables the MCP server |
| Authentication mode | OAuth 2.0 or Legacy Bearer Token |
| Bind address | Address on which the MCP HTTP server listens |
| Port | MCP HTTP port |
| NodeBB URL | Internal URL used by the MCP process to reach NodeBB |
| Bearer token | Shared authentication token; used only in Legacy Bearer mode |
| Service user UID | NodeBB account used for MCP operations; used only in Legacy Bearer mode |

OAuth 2.0 is the default authentication mode. Each MCP client authorizes a specific NodeBB user. MCP operations then run with that user's identity and permissions.

Legacy Bearer Token mode is retained for backward compatibility. In this mode, all clients share the configured Bearer token and MCP operations run as the configured service user.

Default MCP connection settings:

```text
Bind address: 127.0.0.1
Port:         3100
NodeBB URL:   http://127.0.0.1:4567
```

The default bind address restricts the MCP listener to localhost. Change it only when remote access is intentionally required and the network exposure is secured.

When exposing MCP through a reverse proxy, publish the external `/mcp` endpoint over HTTPS.

### Nginx reverse proxy

Add this location inside the existing HTTPS `server` block for your forum. Keep the regular NodeBB proxy location (usually `location /`) so that the OAuth authorization and metadata endpoints continue to be handled by NodeBB.

```nginx
location = /mcp {
    proxy_pass http://nodebb:3100;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    # Required for MCP Streamable HTTP responses.
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;

    # Allow long-running MCP requests and streams.
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

The example assumes that Nginx and the NodeBB container are connected to the same Docker network and that the MCP process is reachable as `nodebb:3100`. In the plugin ACP, set **Bind address** to `0.0.0.0` for this container-to-container setup. Do not publish port 3100 to the public host; keep it accessible only on the private Docker network.

If Nginx runs directly on the same host and shares the host network namespace with the MCP process, use `proxy_pass http://127.0.0.1:3100;` and keep **Bind address** set to `127.0.0.1`.

The location is an exact match and the `proxy_pass` directive has no URI suffix, so Nginx forwards the original `/mcp` path unchanged. Do not route the OAuth `/.well-known` endpoints to port 3100; they are served by NodeBB through the regular forum proxy location.

The plugin automatically generates a separate random token for its internal API. This token is used only between the MCP process and the NodeBB plugin. It is distinct from the client access token and must never be shared with MCP clients.

In OAuth mode, users manage their MCP access and revoke individual client grants from their NodeBB account page:

`/user/<userslug>/integration`

## MCP authentication

### OAuth 2.0

OAuth 2.0 is the default authentication mode.

The plugin implements the OAuth 2.0 Authorization Code flow with PKCE (`S256`). MCP clients are public clients and do not use a client secret.

The authorization server exposes its metadata at:

`https://forum.example.com/.well-known/oauth-authorization-server`

The plugin supports Client ID Metadata Documents (CIMD). A client identifies itself using an HTTPS URL that points to its metadata document.

When a user connects a new client:

1. The plugin retrieves and validates the client's metadata.
2. The user authenticates with NodeBB.
3. NodeBB displays a consent screen.
4. After the user approves access, the client is automatically authorized for that user.

A previously approved client does not require consent again while its authorization grant and client metadata remain valid. If the grant is revoked or the client's metadata changes, the user must approve authorization again.

Each OAuth client acts as the NodeBB user who authorized it. The user's NodeBB permissions apply to MCP operations.

OAuth token lifetimes:

| Token | Lifetime |
|---|---|
| Authorization code | 5 minutes |
| Access token | 15 minutes |
| Refresh token | 30 days |

Refresh tokens are rotated when used.

Users can manage MCP access from their NodeBB account page. They can disable MCP access globally or revoke individual client grants. Disabling global access invalidates existing tokens. Enabling access again requires clients to authorize again.

### Legacy Bearer Token

Legacy Bearer Token mode is provided for backward compatibility.

In this mode, all MCP clients use the same configured static Bearer token. MCP operations run as the NodeBB account specified by the Service user UID setting.

Use this mode only when compatibility with an existing Bearer-token integration is required.

## MCP tools

The MCP server provides 15 tools:

| Tool | Description |
|---|---|
| `get_forum_info` | Get public forum information |
| `get_post` | Read a post |
| `get_topic` | Read topic metadata |
| `get_user` | Read public user profile fields |
| `search_knowledge` | Search indexed forum content semantically |
| `create_topic` | Create a topic |
| `delete_topic` | Soft-delete a topic |
| `restore_topic` | Restore a topic |
| `list_topics` | List accessible topics |
| `create_post` | Create a reply |
| `edit_post` | Edit a post |
| `delete_post` | Soft-delete a post |
| `restore_post` | Restore a post |
| `delete_user_posts` | Soft-delete a user's replies in batches |
| `list_posts` | List posts in a topic |

All write operations use native NodeBB methods and permission checks.

Deletion tools perform soft deletion, not permanent data removal. `delete_user_posts` skips the first post of every topic. Restoring a topic does not automatically restore posts that were separately deleted.

See the complete reference for argument schemas, defaults, limits, response fields, permissions, pagination and examples:

- [MCP API Reference (English)](docs/MCP.md)
- [Справочник MCP API (Русский)](docs/MCP.ru.md)

## Security

- OAuth 2.0 is the default MCP authentication mode. It uses Authorization Code + PKCE (`S256`) and explicit user consent.
- OAuth access tokens expire after 15 minutes. Refresh tokens have a 30-day lifetime and are rotated when used.
- OAuth client metadata is retrieved from HTTPS CIMD URLs. The plugin validates public DNS addresses and TLS certificates when fetching metadata.
- Users can disable their MCP access globally or revoke individual client grants.
- Legacy Bearer mode uses a shared static token and a configured service account. Use it only when backward compatibility is required.
- The internal NodeBB API uses a separate automatically generated token. Never expose this token to MCP clients.
- Internal API routes require authentication and are disabled when MCP is disabled.
- The default MCP bind address is `127.0.0.1`.
- Read and write operations use NodeBB permissions for the authenticated OAuth user or the configured legacy service user.
- Semantic search filters results by the acting user's permissions.
- Public user lookup returns only the selected profile fields.
- Secret values are not included in the plugin's public configuration information.

Use HTTPS for externally accessible MCP and OAuth endpoints. Do not expose the internal API token. In Legacy Bearer mode, protect the shared token as a credential with access to the configured service account.

## Development

Install dependencies:

```bash
npm install
```

Run syntax checks:

```bash
npm run check
```

Run the test suite:

```bash
npm test
```

The tests cover API authentication, API handlers, argument validation and MCP tool behavior.

## Project structure

```text
.
├── library.js
├── plugin.json
├── package.json
├── README.md
├── README.ru.md
├── docs/
│   ├── MCP.md
│   └── MCP.ru.md
├── src/
│   ├── ai/
│   ├── config/
│   ├── mcp/
│   ├── nodebb/
│   ├── oauth/
│   └── routes/
├── public/
├── languages/
└── test/
```

## Compatibility

Designed for NodeBB 4.x.

Version 0.6.2 has been tested with NodeBB 4.16.8.

The plugin requires Node.js >= 22. Native NodeBB response fields may vary between NodeBB versions.

## License

MIT
