# NodeBB Integration

AI and MCP integration layer for NodeBB.

The plugin connects NodeBB to AI-powered semantic search and exposes forum functionality to external AI clients through the Model Context Protocol (MCP).

- **Version:** 0.6.0
- **License:** MIT
- **NodeBB:** 4.x
- **Node.js:** >= 22

## Features

- MCP server using Streamable HTTP transport.
- Separate MCP child process managed by the plugin.
- Bearer-token authentication for MCP clients.
- Separate authentication token for the internal NodeBB API.
- Configurable MCP bind address, port and service account.
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

MCP can be used independently of semantic search. The `search_knowledge` tool requires the OpenAI provider and Qdrant.

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

### Search and indexing

The plugin uses embeddings to index forum content and Qdrant to store and retrieve vectors.

Search results are not returned solely on the basis of vector similarity. Before returning a result, the plugin checks whether the configured NodeBB service user can read the corresponding post and topic.

Excluded Categories allows selected categories to be omitted from semantic search.

The plugin validates retrieved post metadata against NodeBB before returning post content. Qdrant is used as the vector index; NodeBB remains the source of post content and access permissions.

### MCP server

MCP settings include:

| Setting | Description |
|---|---|
| Enable MCP | Enables or disables the MCP server |
| Bind address | Address on which the MCP HTTP server listens |
| Port | MCP HTTP port |
| NodeBB URL | Internal URL used by the MCP process to reach NodeBB |
| Bearer token | Authentication token for MCP clients |
| Service user UID | NodeBB account used for permission checks and write operations |

Default MCP connection settings:

```text
Bind address: 127.0.0.1
Port:         3100
NodeBB URL:   http://127.0.0.1:4567
```

The default bind address restricts the MCP listener to localhost. Change it only when remote access is intentionally required and the network exposure is secured.

The plugin automatically generates a separate random token for its internal API. This token is distinct from the MCP client Bearer token and is not intended to be shared with clients.

The configured service user is the actor for MCP operations. A client cannot override the acting UID.

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

- MCP clients must authenticate with a Bearer token.
- The internal NodeBB API uses a separate automatically generated token.
- Internal API routes require authentication and are disabled when MCP is disabled.
- The default MCP bind address is `127.0.0.1`.
- The configured service user determines the permissions available to MCP operations.
- Read operations apply NodeBB access checks.
- Semantic search filters results by the service user's permissions.
- Public user lookup returns only the selected profile fields.
- Secret values are not included in the plugin's public configuration information.

Use a dedicated NodeBB service account with only the permissions required for the intended MCP operations. Do not expose the internal API token.

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
│   └── routes/
├── public/
├── languages/
└── test/
```

## Compatibility

Designed for NodeBB 4.x.
Version 0.6.0 has been tested with NodeBB 4.16.7.

The plugin requires Node.js >= 22. Native NodeBB response fields may vary between NodeBB versions.

## License

MIT
