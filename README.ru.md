# NodeBB Integration Layer

AI-слой интеграции для форумов NodeBB с поддержкой MCP, семантического поиска, RAG pipeline и векторного хранилища Qdrant.

## Возможности

* Интеграция с NodeBB
* MCP (Model Context Protocol) сервер
* Семантический поиск по содержимому форума
* RAG pipeline (Retrieval Augmented Generation)
* Поддержка Qdrant Vector Database
* Поддержка OpenAI Embeddings
* Локальный режим с fake embeddings
* Работа без NodeBB для разработки
* Автоматические тесты через GitHub Actions

# Архитектура

```
                 NodeBB

                   |
                   |

          Integration Layer

                   |

      +------------+------------+

      |                         |

     MCP                       AI

      |                         |

   Tools API              Embeddings

                                  |

                                Qdrant

                                  |

                           Knowledge Base
```

# Требования

Минимально:

* Node.js >= 20
* npm >= 10

Опционально:

* NodeBB
* Redis
* Qdrant
* OpenAI API

# Установка

Клонирование:

```bash
git clone https://github.com/Sergey-ek/nodebb-plugin-integration.git

cd nodebb-plugin-integration
```

Установка зависимостей:

```bash
npm install
```

Создание конфигурации:

```bash
cp .env.example .env
```

# Режим разработки

По умолчанию используется локальный генератор векторов:

```
AI_PROVIDER=fake
```

Этот режим позволяет запускать проект без:

* OpenAI API
* Qdrant
* NodeBB

Проверка конфигурации:

```bash
npm run diagnose
```

Пример:

```
{
 environment: "development",

 embeddings:
 {
   provider: "fake",
   size: 1536
 }
}
```

# Тестирование

Проверка синтаксиса:

```bash
npm run check
```

Запуск тестов:

```bash
npm test
```

Ожидаемый результат:

```
8 passing
```

# Интеграция с NodeBB

Настройка:

```
NODEBB_URL=http://localhost:4567

NODEBB_API_KEY=your_token
```

При работе внутри NodeBB используются оригинальные модули NodeBB.

В standalone режиме используются безопасные адаптеры:

```
NodeBB отсутствует

        |

Fallback adapter

        |

Тесты продолжают работать
```

# AI Pipeline

Полный поток:

```
Сообщение форума

        |

Создание embedding

        |

Сохранение vector

        |

Qdrant similarity search

        |

Получение контекста

        |

AI ответ
```

# Embeddings

## Fake режим

Для разработки:

```
AI_PROVIDER=fake
```

Плюсы:

* бесплатно;
* быстро;
* не требует сети;
* используется в тестах.

## OpenAI режим

Настройка:

```
AI_PROVIDER=openai

OPENAI_API_KEY=your_key
```

# Qdrant

Конфигурация:

```
QDRANT_URL=http://localhost:6333

QDRANT_COLLECTION=nodebb_knowledge
```

Автоматически выполняется:

* проверка коллекции;
* создание коллекции;
* загрузка векторов;
* поиск похожих документов.

# MCP сервер

Запуск:

```bash
npm run mcp
```

Доступные инструменты:

```
get_forum_info

get_post

get_topic

get_user

search_knowledge
```

Пример поиска:

```
search_knowledge

{
 "query": "как установить NodeBB",
 "limit": 5
}
```

# Структура проекта

```
.

├── library.js

├── package.json

├── plugin.json


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

├── nodebb

│   ├── meta.js

│   ├── posts.js

│   ├── topics.js

│   └── users.js


│

└── config

    └── index.js


└── test

    └── plugin.test.js
```

# Безопасность

Не добавлять в Git:

```
.env

OPENAI_API_KEY

NODEBB_API_KEY

```

# Лицензия

MIT
