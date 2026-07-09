# NodeBB Integration Layer

AI integration layer for NodeBB forums with MCP, semantic search, RAG pipeline and Qdrant vector storage.

![Node.js](https://img.shields.io/badge/node-%3E%3D20-green)
![Tests](https://github.com/Sergey-ek/nodebb-plugin-integration/actions/workflows/test.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

* NodeBB integration adapter
* MCP (Model Context Protocol) server
* Semantic search
* RAG knowledge pipeline
* Qdrant vector database support
* OpenAI embeddings support
* Fake embeddings for local development
* Standalone development mode
* Automated tests with GitHub Actions

## Architecture

```
                    NodeBB

                      |
                      |

                Integration Layer

                      |
        +-------------+-------------+

        |                           |

      MCP                         AI

        |                           |

   Tools API                  Embeddings

                                    |

                                  Qdrant

                                    |

                              Knowledge Base
```

## Requirements

* Node.js >= 20
* npm >= 10

Optional:

* NodeBB
* Redis
* Qdrant
* OpenAI API key

## Installation

Clone repository:

```bash
git clone https://github.com/Sergey-ek/nodebb-plugin-integration.git

cd nodebb-plugin-integration
```

Install dependencies:

```bash
npm install
```

Create environment file:

```bash
cp .env.example .env
```

## Development mode

By default the project uses fake embeddings:

```
AI_PROVIDER=fake
```

This allows running tests without:

* OpenAI
* Qdrant
* NodeBB

Run diagnostics:

```bash
npm run diagnose
```

Example:

```
{
 environment: "development",
 embeddings: {
   provider: "fake",
   size: 1536
 }
}
```

## Testing

Syntax check:

```bash
npm run check
```

Run tests:

```bash
npm test
```

Expected:

```
8 passing
```

## NodeBB Integration

Configure:

```
NODEBB_URL=http://localhost:4567

NODEBB_API_KEY=your_token
```

When running inside NodeBB, the plugin uses native NodeBB modules.

Standalone mode provides safe fallback adapters.

## AI Pipeline

Flow:

```
Forum post

    |

Embedding generation

    |

Vector storage

    |

Qdrant similarity search

    |

Knowledge retrieval

    |

AI response
```

Supported providers:

### Fake

Development mode:

```
AI_PROVIDER=fake
```

### OpenAI

Production mode:

```
AI_PROVIDER=openai

OPENAI_API_KEY=your_key
```

## Qdrant

Configure:

```
QDRANT_URL=http://localhost:6333

QDRANT_COLLECTION=nodebb_knowledge
```

The system automatically:

* checks collection;
* creates collection;
* stores vectors;
* performs similarity search.

## MCP Server

Start MCP:

```bash
npm run mcp
```

Available tools:

```
get_forum_info

get_post

get_topic

get_user

search_knowledge
```

Example:

```
search_knowledge

{
 "query": "installation guide",
 "limit": 5
}
```

## Project Structure

```
.
├── library.js

├── package.json

├── plugin.json

├── src

│   ├── ai

│   │   ├── embeddings.js

│   │   ├── openai.js

│   │   ├── qdrant.js

│   │   ├── indexer.js

│   │   └── search.js

│   │

│   ├── mcp

│   │   ├── server.js

│   │   └── tools.js

│   │

│   ├── nodebb

│   │   ├── meta.js

│   │   ├── posts.js

│   │   ├── topics.js

│   │   └── users.js

│   │

│   └── config

│       └── index.js

│

└── test

    └── plugin.test.js
```

## Security

Never commit:

```
.env

OPENAI_API_KEY

NODEBB_API_KEY
```

## License

MIT
