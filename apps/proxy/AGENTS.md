# @shadowtube/proxy

Прокси для обхода CORS: мобилка не может напрямую тянуть субтитры YouTube.

## Два режима

| Файл | Запуск | Когда использовать |
|------|--------|-------------------|
| `src/node-server.ts` | `pnpm dev:node` / корневой `pnpm proxy:dev` | **Локальная разработка** — `youtube-transcript` + `youtubei.js` (metadata) |
| `src/index.ts` | `pnpm dev` (wrangler) / `pnpm deploy` | Edge CF Worker — fetch парсинг; часто пустые сабы |

## API

- `GET /transcript?videoId=&lang=en` → `{ segments, hasManualCaptions, language }`
- `GET /metadata?videoId=` → `{ title, channel, durationSec, thumbnail }`
- CORS: `Access-Control-Allow-Origin: *`

## Проверка

```bash
curl http://localhost:8787/
curl "http://localhost:8787/transcript?videoId=dQw4w9WgXcQ&lang=en" | head -c 400
```

Сервер **блокирует терминал** — это нормально. Остановка: Ctrl+C.

Корневой контекст: [../../AGENTS.md](../../AGENTS.md).
