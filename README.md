# nodebb-plugin-integration
Universal integration layer for NodeBB. Provides REST API, MCP support, AI agents, automation and external integrations.

# NodeBB Integration Layer

AI integration framework for NodeBB forums.

**NodeBB Integration Layer** transforms a NodeBB forum into an AI-powered knowledge platform with:

- REST API access to forum data
- Model Context Protocol (MCP) support
- AI semantic search
- Embedding pipeline
- Vector database integration
- Retrieval-Augmented Generation (RAG) capabilities

The main purpose of this project is to make forum knowledge available for modern AI assistants.

---

# Vision

A traditional forum stores knowledge in discussions.

This project adds an AI knowledge layer:

```
Forum discussions

        |

        v

Knowledge extraction

        |

        v

Embeddings

        |

        v

Vector database

        |

        v

AI assistants
```

The result is an intelligent forum where users and AI agents can discover knowledge by meaning, not only by keywords.

---

# Features

## NodeBB Integration API

Provides access to:

- Forum information
- Recent topics
- Full topic content
- Topic search


## MCP Server

Supports the Model Context Protocol.

Compatible with:

- Claude Desktop
- Cursor
- MCP-compatible AI agents


Available MCP tools:

| Tool | Description |
|---|---|
| `forum_info` | Get forum information |
| `recent_topics` | Get recent topics |
| `get_topic` | Read complete topic with posts |
| `search_topics` | Text search |
| `semantic_search` | AI semantic search |


---

# Architecture

```
                 AI Client

        Claude / Cursor / Agent

                    |

                    |

              MCP Protocol

                    |

                    |

        NodeBB Integration Layer

                    |

        +-----------+-----------+

        |           |           |

      Topics      Posts      Search

        |

        |

 Knowledge Pipeline

        |

        v

 Embedding Generator

        |

        v

 Qdrant Vector Database

        |

        v

 Semantic Search
```

---

# Project Structure

```
nodebb-plugin-integration

тФЬтФАтФА plugin.json
тФЬтФАтФА package.json
тФЬтФАтФА library.js
тФЬтФАтФА README.md
тФЬтФАтФА LICENSE
тФЬтФАтФА CONTRIBUTING.md
тФЬтФАтФА .env.example
тФЬтФАтФА docker-compose.yml
тФВ
тФФтФАтФА lib
    |
    тФЬтФАтФА routes.js
    |
    тФЬтФАтФА services
    |    тФЬтФАтФА forum.js
    |    тФЬтФАтФА topics.js
    |    тФЬтФАтФА topic.js
    |    тФФтФАтФА search.js
    |
    тФЬтФАтФА mcp
    |    тФЬтФАтФА server.js
    |    тФФтФАтФА tools.js
    |
    тФЬтФАтФА events
    |    тФФтФАтФА index.js
    |
    тФФтФАтФА knowledge
         тФЬтФАтФА embeddings.js
         тФЬтФАтФА qdrant.js
         тФЬтФАтФА search.js
         тФФтФАтФА indexer.js
```

---

# Installation

## Requirements

- NodeBB
- Node.js 18+
- npm
- Qdrant (optional for semantic search)
- OpenAI compatible embedding API


---

## Install plugin


Go to your NodeBB directory:

```bash
cd node_modules
```


Clone repository:

```bash
git clone https://github.com/Sergey-ek/nodebb-plugin-integration.git
```


Install dependencies:

```bash
cd nodebb-plugin-integration

npm install
```


Restart NodeBB:

```bash
./nodebb restart
```

---

# Configuration

Create environment file:

```
.env
```

Example:

```env
OPENAI_API_KEY=your_api_key

QDRANT_URL=http://localhost:6333

QDRANT_COLLECTION=nodebb_topics

EMBEDDING_MODEL=text-embedding-3-small
```

---

# API

Base path:

```
/api/integration/v1
```

---

# Health Check

Request:

```
GET /ping
```

Response:

```json
{
  "ok": true,
  "plugin": "nodebb-plugin-integration"
}
```

---

# Forum Information

Request:

```
GET /info
```

Example:

```json
{
 "title":"AIBusters",
 "url":"https://aibusters.net",
 "version":"1.x"
}
```

---

# Recent Topics

Request:

```
GET /topics/recent?limit=10
```

Response:

```json
[
 {
   "tid":123,
   "title":"AI Security Research",
   "author":"user",
   "replies":15
 }
]
```

---

# Get Topic

Request:

```
GET /topics/{tid}
```

Returns:

- topic metadata
- category
- author
- posts
- timestamps


Example:

```json
{
 "tid":123,
 "title":"AI Security",

 "posts":[

  {
   "username":"researcher",
   "content":"Discussion text"
  }

 ]
}
```

---

# Search Topics

Request:

```
GET /search?q=AI+security
```

Returns matching topics.

---

# MCP Interface

Endpoint:

```
POST /api/integration/v1/mcp
```

---

## List available tools

Request:

```json
{
 "method":"tools/list"
}
```

Example response:

```json
{
 "tools":[

  {
   "name":"semantic_search",
   "description":
   "Search forum knowledge by meaning"
  }

 ]
}
```

---

## Execute MCP tool

Example:

```json
{
 "method":"tools/call",

 "params":{

  "name":"semantic_search",

  "arguments":{

   "query":
   "How can AI agents be attacked?"

  }

 }
}
```

---

# Knowledge Pipeline

The plugin can automatically index forum content.

Flow:

```
New forum post

        |

        v

NodeBB Event

        |

        v

Knowledge Indexer

        |

        v

Clean text

        |

        v

Create embedding

        |

        v

Store vector

        |

        v

Semantic AI Search
```

---

# Vector Database

Currently supported:

## Qdrant


Docker example:

```bash
docker compose up -d
```


Collection:

```
nodebb_topics
```


Embedding size:

```
1536
```


Distance:

```
Cosine
```

---

# Semantic Search

Semantic search allows questions like:

```
What are the risks of autonomous AI agents?
```

even if the forum posts contain different wording:

```
AI agent privilege escalation attacks
```

The system searches by meaning instead of exact text.

---

# Development


Clone:

```bash
git clone https://github.com/Sergey-ek/nodebb-plugin-integration.git
```


Install:

```bash
npm install
```


Check syntax:

```bash
node --check lib/routes.js
```


---

# Git Workflow


Create branch:

```bash
git checkout -b feature-name
```


Commit:

```bash
git add .

git commit -m "Description"
```


Push:

```bash
git push origin feature-name
```

---

# Roadmap


## Version 0.1

Completed:

- NodeBB API
- MCP foundation
- Topic access
- Search integration


## Version 0.2

Planned:

- Qdrant integration
- Automatic indexing
- Embedding pipeline


## Version 0.3

Planned:

- AI summaries
- Knowledge documents
- RAG pipeline


## Version 1.0

Goal:

Complete AI knowledge platform for NodeBB.

---

# Security Considerations

The plugin should:

- protect MCP endpoints
- restrict API access
- secure API keys
- validate external requests
- avoid exposing private forum content


---

# License

MIT License


---

# Author

aibusters.net

GitHub: https://github.com/Sergey-ek