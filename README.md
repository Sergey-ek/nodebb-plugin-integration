# NodeBB Integration Layer

Integration plugin for NodeBB forums providing MCP (Model Context Protocol), AI-powered semantic search, RAG retrieval and Qdrant vector storage.

## Features

- NodeBB integration
- MCP server using Streamable HTTP
- Separate MCP child process managed by NodeBB
- Bearer token authentication
- Internal API authentication between MCP and NodeBB
- OpenAI embeddings
- Qdrant vector storage and semantic search
- RAG retrieval with NodeBB access control
- Individual post indexing, including replies
- Configurable excluded categories
- OpenAI and Fake AI provider modes
- ACP configuration interface
- Automated tests

## Architecture

NodeBB → Integration Plugin → MCP / AI

MCP: Streamable HTTP → MCP Child Process → Internal NodeBB API → NodeBB Access Control

AI: OpenAI → Embeddings → Qdrant → Vector Search → Knowledge Retrieval

## Requirements

- Node.js >= 20
- npm >= 10
- NodeBB 4.x

AI functionality requires an OpenAI API key and a Qdrant server. MCP requires a running NodeBB instance.

## Installation

Install the plugin using the NodeBB plugin management interface or your usual NodeBB plugin installation procedure.

Install dependencies in the plugin directory using npm install.

Restart NodeBB and configure the plugin in ACP → Plugins → NodeBB Integration.

## Configuration

The plugin is configured through the NodeBB ACP interface.

### AI Provider

Two providers are available.

**OpenAI**

Enables:
- OpenAI embedding generation
- Qdrant vector storage
- Post indexing
- Semantic search
- RAG retrieval

Configure the OpenAI API key, embedding model, embedding dimensions, Qdrant URL and collection name.

**Fake**

Disables AI functionality completely:
- OpenAI API is not called.
- Qdrant is not accessed.
- Embeddings are not generated.
- Post indexing is disabled.
- Semantic search is disabled.

NodeBB integration and MCP remain available.

OpenAI and Qdrant settings are preserved when switching providers. Selecting OpenAI again re-enables the AI pipeline.

Fake mode is useful for developing and testing the NodeBB and MCP integration without external AI services.

### Excluded Categories

Categories selected in ACP are excluded from AI indexing and semantic search.

## AI Pipeline

When OpenAI is enabled:

Forum Post → Embedding Generation → Qdrant Vector Storage → Semantic Search → NodeBB Access Control → Knowledge Retrieval

Each post is indexed independently, including replies.

Search results are checked against NodeBB permissions before post content is retrieved. Posts and topics that the service user cannot read are excluded.

Qdrant stores vectors and metadata only. Post text is retrieved from NodeBB after access checks.

## Qdrant

Configure the Qdrant URL, collection name and embedding dimensions through ACP.

The plugin checks whether the collection exists and creates it when necessary.

Qdrant is not accessed when Fake is selected.

## MCP Server

The MCP server is managed by the NodeBB plugin and runs as a separate child process.

Transport:
- Streamable HTTP
- Bearer token authentication

The MCP server communicates with NodeBB through an authenticated internal API using a separate secret managed by the plugin.

Configure in ACP:
- Enable or disable MCP
- Bind address
- Port
- NodeBB URL
- Bearer token
- Service user UID

The service user UID is configured by the administrator. MCP clients cannot override it.

### Available Tools

- get_forum_info — Get public forum information.
- get_post — Retrieve a post after access checks.
- get_topic — Retrieve a topic after access checks.
- get_user — Retrieve public user information.
- search_knowledge — Search indexed forum knowledge.

search_knowledge requires the OpenAI provider. In Fake mode, it returns an explicit AI-disabled error.

## Security

- MCP clients authenticate using a Bearer token.
- Internal API requests use a separate secret.
- Secret values are never returned to the ACP interface.
- Empty secret fields preserve existing values.
- User IDs supplied by MCP clients are not trusted.
- The configured service user is used for access checks.
- Post and topic permissions are checked before content is returned.
- Access-check failures deny access.
- Qdrant payloads contain identifiers and metadata, not post text.

Never commit API keys, tokens or other secrets.

## Development and Testing

Install dependencies: npm install

Syntax checks: npm run check

Tests: npm test


The test suite validates configuration, MCP tool arguments and other plugin components.

## Project Structure

library.js
package.json
plugin.json
public/
  js/admin.js
  templates/admin/plugins/integration.tpl
src/
  ai/
    embeddings.js
    indexer.js
    openai.js
    qdrant.js
    search.js
  config/
    index.js
    validation.js
  events/
    index.js
  mcp/
    manager.js
    server.js
    tools.js
  nodebb/
    categories.js
    index.js
    meta.js
    posts.js
    privileges.js
    topics.js
    users.js
  routes/
    api.js
    index.js
test/
  config-validation.test.js
  mcp-tools.test.js

## License

MIT