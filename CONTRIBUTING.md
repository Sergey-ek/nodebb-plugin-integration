# Contributing Guide

Thank you for your interest in contributing to **NodeBB Integration Layer**.

This document describes how to set up the development environment, run tests, create changes, and submit contributions.

---

# 1. Project Overview

NodeBB Integration Layer is an extension layer for NodeBB forums that provides:

* AI integration;
* MCP (Model Context Protocol) support;
* semantic search;
* RAG knowledge pipeline;
* Qdrant vector storage;
* OpenAI embeddings;
* external AI agent access.

Architecture:

```
NodeBB
 |
 +-- Integration Plugin
        |
        +-- REST API
        |
        +-- MCP Server
        |
        +-- AI Pipeline
                |
                +-- Embeddings
                |
                +-- Qdrant
```

---

# 2. Development Requirements

Required:

* Node.js >= 20
* npm >= 10
* Git

Recommended:

* Node.js 22 LTS
* Visual Studio Code
* Windows 10/11, Linux or macOS

Check versions:

```bash
node -v
npm -v
git --version
```

---

# 3. Clone Repository

Clone the project:

```bash
git clone https://github.com/Sergey-ek/nodebb-plugin-integration.git
```

Enter directory:

```bash
cd nodebb-plugin-integration
```

---

# 4. Install Dependencies

Install packages:

```bash
npm install
```

This installs:

* MCP SDK;
* OpenAI SDK;
* Qdrant client;
* testing framework;
* development tools.

---

# 5. Environment Configuration

Create local configuration:

```bash
copy .env.example .env
```

Linux/macOS:

```bash
cp .env.example .env
```

Example:

```env
NODE_ENV=development

AI_PROVIDER=fake

EMBEDDING_SIZE=1536

QDRANT_URL=http://localhost:6333

QDRANT_COLLECTION=nodebb_knowledge

OPENAI_API_KEY=
```

---

# 6. Development Modes

## Test mode

Default:

```env
AI_PROVIDER=fake
```

Uses generated vectors.

Advantages:

* no API key required;
* works offline;
* fast tests.

---

## Production AI mode

Enable OpenAI:

```env
AI_PROVIDER=openai

OPENAI_API_KEY=your_key
```

Uses:

* OpenAI embeddings;
* real semantic search.

---

# 7. Running Tests

Run all tests:

```bash
npm test
```

Expected:

```
passing
```

Tests verify:

* plugin loading;
* configuration;
* AI modules;
* MCP server;
* adapters.

---

# 8. Code Validation

Before committing:

```bash
npm run check
```

Checks JavaScript syntax:

```
library.js
routes
MCP server
MCP tools
```

---

# 9. Project Structure

```
nodebb-plugin-integration

├── library.js

├── package.json

├── src
│
├── ai
│   ├── embeddings.js
│   ├── openai.js
│   ├── qdrant.js
│   ├── indexer.js
│   └── search.js
│
├── mcp
│   ├── server.js
│   └── tools.js
│
├── routes
│   ├── index.js
│   └── api.js
│
├── nodebb
│   ├── meta.js
│   ├── posts.js
│   ├── topics.js
│   └── users.js
│
└── test
    └── plugin.test.js
```

---

# 10. Adding New Features

Before adding code:

1. Create an issue describing the feature.
2. Discuss architecture if the change is large.
3. Keep changes isolated.

Example:

New MCP tool:

```
src/mcp/tools.js
```

New AI provider:

```
src/ai/providers/
```

New API endpoint:

```
src/routes/api.js
```

---

# 11. Coding Style

Use:

```javascript
"use strict";
```

Use:

* async/await;
* meaningful names;
* small functions;
* error handling.

Example:

```javascript
async function loadData() {

    try {

        return await service.load();

    }

    catch(error) {

        console.error(error);

        return null;

    }

}
```

---

# 12. Git Workflow

Create a branch:

```bash
git checkout -b feature/my-feature
```

Make changes.

Check:

```bash
npm test
```

Commit:

```bash
git add .
git commit -m "Add new feature"
```

Push:

```bash
git push origin feature/my-feature
```

---

# 13. Pull Request Requirements

Pull requests should include:

* clear description;
* testing information;
* screenshots if UI changes;
* migration notes if needed.

Example:

```
Feature:
Added semantic search MCP tool.

Testing:
npm test

Environment:
Node 22
Windows 10
```

---

# 14. Security Rules

Do not commit:

* `.env`;
* API keys;
* passwords;
* private NodeBB tokens.

Never add:

```
OPENAI_API_KEY=sk-xxxxx
```

to Git.

---

# 15. Reporting Bugs

Include:

* Node.js version;
* operating system;
* error message;
* reproduction steps.

Example:

```
Node:
22.23.1

OS:
Windows 10

Command:
npm test

Error:
Qdrant connection failed
```

---

# 16. AI Development Notes

The AI pipeline supports:

```
Text
 |
 v
Embedding Provider
 |
 v
Vector Database
 |
 v
Semantic Search
 |
 v
MCP / API
```

Embedding providers:

* fake (development);
* OpenAI (production);
* future local models.

---

# 17. License

By contributing, you agree that your contributions will be licensed under the project's MIT License.

---

Thank you for contributing to NodeBB Integration Layer.
