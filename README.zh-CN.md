

# NodeBB Integration

NodeBB 的 AI 与 MCP 集成层。

该插件将 NodeBB 与 AI 驱动的语义搜索连接起来，并通过模型上下文协议（MCP）向外部 AI 客户端开放论坛功能。

- **版本：** 0.6.2
- **许可证：** MIT
- **NodeBB：** 4.x
- **Node.js：** >= 22

## 功能特性

- 使用 Streamable HTTP 传输协议的 MCP 服务器。
- 由插件管理的独立 MCP 子进程。
- 支持 OAuth 2.0 身份验证，采用 Authorization Code + PKCE（`S256`）流程。
- 支持面向公共 OAuth 客户端的 CIMD（客户端 ID 元数据文档）。
- 提供明确的用户授权确认和 MCP 访问管理功能。
- 保留传统静态 Bearer Token 身份验证，以实现向后兼容。
- 用于内部 NodeBB API 的独立身份验证令牌。
- 可配置 MCP 绑定地址、端口和身份验证模式。
- 提供 15 个 MCP 工具，用于获取论坛信息、读取、搜索和管理内容。
- 支持 OpenAI Embedding 向量生成和语义搜索。
- 集成 Qdrant 向量数据库。
- 基于权限的检索：搜索结果会根据 NodeBB 访问权限进行过滤。
- 支持单篇帖子索引和分类排除。
- 支持 OpenAI 和 Fake AI 提供商模式。
- 提供 NodeBB ACP 管理配置界面。
- 包含针对 API 处理程序和 MCP 工具的自动化测试。

## 系统要求

- Node.js >= 22。
- npm >= 10。
- NodeBB 4.x。
- 正常运行的 NodeBB 实例。

AI 语义搜索还需要以下服务：

- OpenAI API 密钥。
- 可访问的 Qdrant 实例，以及根据插件 Embedding 模型配置的 Collection。

不依赖语义搜索的 MCP 工具可以独立使用，无需配置 OpenAI 和 Qdrant。`search_knowledge` 工具需要同时启用 OpenAI 提供商并配置 Qdrant。

## 安装

可以通过 NodeBB 管理界面或标准 NodeBB 插件安装流程安装此插件。

手动安装：

```bash
cd /path/to/nodebb
npm install nodebb-plugin-integration
```

按照当前 NodeBB 部署方式执行构建并重启 NodeBB。

安装完成后，打开：

**NodeBB ACP → 插件 → NodeBB Integration**

配置所需选项并保存设置。

## 配置

插件通过 NodeBB ACP 管理配置。

### AI 提供商

插件支持两种提供商模式：

- **OpenAI** — 启用 Embedding 向量生成和语义搜索。
- **Fake** — 禁止调用 OpenAI 服务。在此模式下无法使用语义搜索。

如需使用语义搜索，请根据实际部署配置 OpenAI API 密钥、Embedding 参数和 Qdrant 连接。

默认 Embedding 配置：

| 设置 | 默认值 |
|---|---|
| Embedding 模型 | `text-embedding-3-small` |
| Embedding 维度 | `1536` |
| Qdrant Collection | `nodebb_knowledge` |

### 搜索与索引

插件使用 Embedding 对论坛内容建立索引，并通过 Qdrant 存储和检索向量。

搜索结果并非仅根据向量相似度返回。在返回结果之前，插件会检查经过身份验证的 OAuth 用户或已配置的传统服务用户是否具有读取相应帖子和主题的权限。

通过 Excluded Categories（排除分类）设置，可以选择不将某些分类纳入语义搜索。

插件会在返回帖子内容之前，向 NodeBB 验证检索到的帖子元数据。Qdrant 仅用作向量索引；帖子内容和访问权限仍以 NodeBB 为准。

## MCP 服务器

MCP 设置位于：

**NodeBB ACP → 插件 → NodeBB Integration**

| 设置 | 说明 |
|---|---|
| Enable MCP | 启用或禁用 MCP 服务器 |
| Authentication mode | 身份验证模式：OAuth 2.0 或 Legacy Bearer Token |
| Bind address | MCP HTTP 服务器监听的地址 |
| Port | MCP HTTP 端口 |
| NodeBB URL | MCP 进程访问 NodeBB 时使用的内部 URL |
| Bearer token | 共享身份验证令牌，仅在 Legacy Bearer 模式下使用 |
| Service user UID | 执行 MCP 操作时使用的 NodeBB 用户账户，仅在 Legacy Bearer 模式下使用 |

OAuth 2.0 是默认身份验证模式。每个 MCP 客户端都需要授权一个特定的 NodeBB 用户。之后，MCP 操作将以该用户的身份和权限执行。

Legacy Bearer Token 模式为向后兼容而保留。在此模式下，所有客户端共用已配置的 Bearer Token，MCP 操作均以指定的服务用户身份执行。

默认 MCP 连接设置：

```text
Bind address: 127.0.0.1
Port:         3100
NodeBB URL:   http://127.0.0.1:4567
```

默认绑定地址仅允许本机访问 MCP 监听端口。只有在确实需要远程访问并且已确保网络安全的情况下，才应修改此设置。

通过反向代理对外提供 MCP 服务时，应通过 HTTPS 发布外部 `/mcp` 端点。

插件会自动生成一个独立的随机令牌，用于内部 API 身份验证。该令牌仅在 MCP 进程与 NodeBB 插件之间使用，与客户端访问令牌相互独立，绝不能分享给 MCP 客户端。

在 OAuth 模式下，用户可以通过自己的 NodeBB 账户页面管理 MCP 访问权限，并撤销单个客户端的授权：

`/user/<userslug>/integration`

## MCP 身份验证

### OAuth 2.0

OAuth 2.0 是默认身份验证模式。

插件实现了基于 PKCE（`S256`）的 OAuth 2.0 Authorization Code 授权流程。MCP 客户端属于公共客户端，无需使用 client secret。

授权服务器在以下地址提供元数据：

`https://forum.example.com/.well-known/oauth-authorization-server`

插件支持 Client ID Metadata Documents（CIMD，客户端 ID 元数据文档）。客户端使用指向其元数据文档的 HTTPS URL 来标识自身。

当用户连接一个新的客户端时：

1. 插件获取并验证客户端元数据。
2. 用户登录 NodeBB。
3. NodeBB 显示授权确认页面。
4. 用户批准访问后，系统会自动为该用户授权此客户端。

对于已经批准的客户端，只要其授权记录和客户端元数据仍然有效，就无需再次征求用户同意。如果授权被撤销，或者客户端元数据发生变化，则用户必须重新批准授权。

每个 OAuth 客户端都以授权它的 NodeBB 用户身份运行。该用户的 NodeBB 权限适用于所有 MCP 操作。

OAuth 令牌有效期：

| 令牌 | 有效期 |
|---|---|
| Authorization Code（授权码） | 5 分钟 |
| Access Token（访问令牌） | 15 分钟 |
| Refresh Token（刷新令牌） | 30 天 |

Refresh Token 在使用时会自动轮换。

用户可以通过 NodeBB 账户页面管理 MCP 访问权限，包括全局禁用 MCP 访问或撤销单个客户端的授权。全局禁用访问会使现有令牌失效。重新启用访问后，客户端必须重新完成授权。

### Legacy Bearer Token

Legacy Bearer Token 模式用于向后兼容。

在此模式下，所有 MCP 客户端使用相同的静态 Bearer Token。MCP 操作以 Service user UID 设置中指定的 NodeBB 账户身份执行。

仅当需要兼容现有 Bearer Token 集成时，才建议使用此模式。

## MCP 工具

MCP 服务器提供 15 个工具：

| 工具 | 说明 |
|---|---|
| `get_forum_info` | 获取公开论坛信息 |
| `get_post` | 读取帖子 |
| `get_topic` | 读取主题元数据 |
| `get_user` | 读取用户公开资料字段 |
| `search_knowledge` | 对已建立索引的论坛内容执行语义搜索 |
| `create_topic` | 创建主题 |
| `delete_topic` | 软删除主题 |
| `restore_topic` | 恢复主题 |
| `list_topics` | 列出当前用户有权访问的主题 |
| `create_post` | 创建回复 |
| `edit_post` | 编辑帖子 |
| `delete_post` | 软删除帖子 |
| `restore_post` | 恢复帖子 |
| `delete_user_posts` | 批量软删除指定用户的回复 |
| `list_posts` | 列出主题中的帖子 |

所有写入操作均使用 NodeBB 原生方法，并执行相应的权限检查。

删除工具执行的是软删除，而不是永久删除数据。`delete_user_posts` 会跳过每个主题的首帖。恢复主题不会自动恢复此前单独删除的帖子。

完整参考文档包含参数 Schema、默认值、限制、响应字段、权限、分页和使用示例：

- [MCP API 参考文档（英文）](docs/MCP.md)
- [MCP API 参考文档（俄文）](docs/MCP.ru.md)

## 安全性

- OAuth 2.0 是默认的 MCP 身份验证模式，采用 Authorization Code + PKCE（`S256`）流程，并要求用户明确授权。
- OAuth Access Token 有效期为 15 分钟。Refresh Token 有效期为 30 天，并在使用时轮换。
- OAuth 客户端元数据通过 HTTPS CIMD URL 获取。插件在获取元数据时会验证公共 DNS 地址和 TLS 证书。
- 用户可以全局禁用 MCP 访问，也可以单独撤销某个客户端的授权。
- Legacy Bearer 模式使用共享静态令牌和指定的服务账户。仅在需要向后兼容时使用。
- 内部 NodeBB API 使用单独自动生成的令牌。绝不要向 MCP 客户端公开此令牌。
- 内部 API 路由需要身份验证，并且在 MCP 被禁用时也会被禁用。
- 默认 MCP 绑定地址为 `127.0.0.1`。
- 读取和写入操作均遵循经过 OAuth 身份验证的用户或已配置的 Legacy 服务用户的 NodeBB 权限。
- 语义搜索会根据实际执行操作的用户权限过滤结果。
- 公开用户查询仅返回选定的用户资料字段。
- 插件的公开配置信息不包含任何密钥值。

对外提供 MCP 和 OAuth 服务时，请使用 HTTPS。不要公开内部 API 令牌。在 Legacy Bearer 模式下，应将共享令牌视为具有服务账户访问权限的敏感凭据妥善保管。

## 开发

安装依赖：

```bash
npm install
```

运行语法检查：

```bash
npm run check
```

运行测试套件：

```bash
npm test
```

测试覆盖 API 身份验证、API 处理程序、参数验证以及 MCP 工具行为。

## 项目结构

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

## 兼容性

专为 NodeBB 4.x 设计。

版本 0.6.2 已在 NodeBB 4.16.8 上完成测试。

插件要求 Node.js >= 22。不同 NodeBB 版本中的原生响应字段可能有所不同。

## 许可证

MIT
