# NodeBB Integration Layer

AI-интеграционный слой для форумов NodeBB.

**NodeBB Integration Layer** превращает обычный форум NodeBB в AI-платформу знаний с поддержкой:

- REST API доступа к данным форума
- Model Context Protocol (MCP)
- AI семантического поиска
- Embedding-пайплайна
- Векторных баз данных
- RAG (Retrieval-Augmented Generation)

Основная цель проекта — сделать знания форума доступными для современных AI-ассистентов.

---

# Идея проекта

Обычный форум хранит знания в виде обсуждений.

Этот проект добавляет AI-слой:

```
Обсуждения форума

        |

        v

Извлечение знаний

        |

        v

Создание embeddings

        |

        v

Векторная база данных

        |

        v

AI-ассистенты
```

В результате форум становится интеллектуальной базой знаний, где поиск выполняется не только по словам, а по смыслу.

---

# Возможности

## API интеграция NodeBB

Предоставляет доступ:

- информация о форуме
- последние темы
- полное содержимое тем
- поиск тем


---

## MCP сервер

Поддержка Model Context Protocol.

Совместимость:

- Claude Desktop
- Cursor
- другие MCP AI-клиенты


Доступные MCP инструменты:

| Инструмент | Назначение |
|-|-|
| `forum_info` | Информация о форуме |
| `recent_topics` | Последние темы |
| `get_topic` | Полное чтение темы |
| `search_topics` | Текстовый поиск |
| `semantic_search` | AI поиск по смыслу |


---

# Архитектура

```
                 AI клиент

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

      Темы       Посты       Поиск

        |

        |

  Knowledge Pipeline

        |

        v

 Генератор Embeddings

        |

        v

 Qdrant Vector Database

        |

        v

 Семантический поиск
```

---

# Структура проекта

```
nodebb-plugin-integration

├── plugin.json
├── package.json
├── library.js
├── README.md
├── README.ru.md
├── LICENSE
├── CONTRIBUTING.md
├── .env.example
├── docker-compose.yml
│
└── lib
    |
    ├── routes.js
    |
    ├── services
    |    ├── forum.js
    |    ├── topics.js
    |    ├── topic.js
    |    └── search.js
    |
    ├── mcp
    |    ├── server.js
    |    └── tools.js
    |
    ├── events
    |    └── index.js
    |
    └── knowledge
         ├── embeddings.js
         ├── qdrant.js
         ├── search.js
         └── indexer.js
```

---

# Установка

## Требования

Необходимо:

- NodeBB
- Node.js 18+
- npm
- Qdrant (для AI поиска)
- API для создания embeddings


---

## Установка плагина


Перейти в каталог NodeBB:

```bash
cd node_modules
```


Клонировать репозиторий:

```bash
git clone https://github.com/Sergey-ek/nodebb-plugin-integration.git
```


Установить зависимости:

```bash
cd nodebb-plugin-integration

npm install
```


Перезапустить NodeBB:

```bash
./nodebb restart
```

---

# Настройка

Создать файл:

```
.env
```


Пример:

```env
OPENAI_API_KEY=ваш_api_ключ

QDRANT_URL=http://localhost:6333

QDRANT_COLLECTION=nodebb_topics

EMBEDDING_MODEL=text-embedding-3-small
```

---

# API

Базовый путь:

```
/api/integration/v1
```

---

# Проверка работы

## Ping

Запрос:

```
GET /ping
```


Ответ:

```json
{
 "ok":true,
 "plugin":"nodebb-plugin-integration"
}
```

---

# Информация о форуме

Запрос:

```
GET /info
```


Возвращает:

- название форума
- URL
- версию NodeBB
- основную информацию

---

# Последние темы


Запрос:

```
GET /topics/recent?limit=10
```


Пример:

```json
[
 {
  "tid":123,
  "title":"AI Security Research",
  "author":"user"
 }
]
```

---

# Получение темы

Запрос:

```
GET /topics/{tid}
```


Возвращает:

- информацию о теме
- категорию
- автора
- сообщения
- временные метки


Пример:

```json
{
 "tid":123,

 "title":"AI Security",

 "posts":[

  {
   "username":"researcher",
   "content":"Текст сообщения"
  }

 ]
}
```

---

# Поиск тем


Запрос:

```
GET /search?q=AI+security
```


Использует стандартный поиск NodeBB.

---

# MCP интерфейс


Endpoint:

```
POST /api/integration/v1/mcp
```


Поддерживаются методы:

```
tools/list

tools/call
```

---

# Получение списка инструментов


Запрос:

```json
{
 "method":"tools/list"
}
```


Ответ:

```json
{
 "tools":[

  {
   "name":"semantic_search"
  }

 ]
}
```

---

# Выполнение MCP инструмента


Пример:

```json
{
 "method":"tools/call",

 "params":{

  "name":"semantic_search",

  "arguments":{

   "query":
   "Какие существуют угрозы AI агентам?"

  }

 }
}
```

---

# AI Knowledge Pipeline

Плагин может автоматически индексировать новые сообщения форума.


Процесс:

```
Новый пост

     |

     v

Событие NodeBB

     |

     v

Индексатор знаний

     |

     v

Очистка текста

     |

     v

Создание embedding

     |

     v

Сохранение в Qdrant

     |

     v

AI семантический поиск
```

---

# Векторная база данных

Поддерживается:

## Qdrant


Запуск:

```bash
docker compose up -d
```


Коллекция:

```
nodebb_topics
```


Размер вектора:

```
1536
```


Метрика:

```
Cosine similarity
```

---

# Семантический поиск


Пример вопроса:

```
Как атакуют автономных AI агентов?
```


Даже если сообщение содержит:

```
Privilege escalation attacks against AI systems
```


оно будет найдено, потому что поиск работает по смыслу.

---

# Разработка


Клонирование:

```bash
git clone https://github.com/Sergey-ek/nodebb-plugin-integration.git
```


Установка:

```bash
npm install
```


Проверка JavaScript:

```bash
node --check lib/routes.js
```

---

# Git Workflow


Создать ветку:

```bash
git checkout -b feature-name
```


Добавить изменения:

```bash
git add .
```


Создать commit:

```bash
git commit -m "Описание изменений"
```


Отправить:

```bash
git push origin feature-name
```

---

# План развития


## Версия 0.1

Готово:

- NodeBB API
- MCP основа
- доступ к темам
- поиск


---

## Версия 0.2

Планируется:

- Qdrant интеграция
- автоматическая индексация
- embeddings


---

## Версия 0.3

Планируется:

- AI summaries
- документы знаний
- RAG pipeline


---

## Версия 1.0

Цель:

Полноценная AI-платформа знаний для NodeBB.


---

# Безопасность


Необходимо:

- защищать MCP endpoint
- ограничивать API доступ
- безопасно хранить ключи
- проверять внешние запросы
- учитывать приватность закрытых разделов форума


---

# Лицензия

MIT License


---

# Автор

Sergey-ek

GitHub:

https://github.com/Sergey-ek