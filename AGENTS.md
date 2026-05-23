# ShadowTube — контекст для AI-агентов (Cursor, Claude Code)

Мобильное Android-приложение для **language shadowing** с YouTube. Пользователь вставляет ссылку → proxy отдаёт субтитры → клиент режет их на чанки по **предложениям/паузам** (не по таймеру) → YouTube IFrame играет отрезок → тап по слову → перевод через **Gemini BYOK** → слова в **SQLite** на устройстве.

## Monorepo

```
shadowtube/
├── apps/mobile/           # @shadowtube/mobile — Expo 56, React Native, Expo Router
├── apps/proxy/            # @shadowtube/proxy — прокси субтитров + metadata
│   ├── src/index.ts       # Cloudflare Worker (fetch, edge; сабы часто пустые)
│   └── src/node-server.ts # Node dev-сервер (youtube-transcript) — ОСНОВНОЙ для локалки
├── packages/shared/       # @shadowtube/shared — общие типы (TranscriptSegment, Chunk, …)
├── AGENTS.md              # этот файл
├── CLAUDE.md              # указатель для Claude Code
└── README.md              # для людей: установка и запуск
```

**Менеджер пакетов:** pnpm workspaces. **Node:** ≥20.

## Команды

| Команда | Назначение |
|---------|------------|
| `pnpm install` | установка зависимостей |
| `pnpm proxy:dev` | Node-proxy на `:8787` (**нужен для субтитров в dev**) |
| `pnpm proxy:cf` | Cloudflare Worker локально (wrangler) |
| `pnpm mobile` | `expo start` в apps/mobile |
| `pnpm --filter @shadowtube/mobile test` | vitest (chunker) |
| `pnpm --filter @shadowtube/mobile typecheck` | tsc |
| `pnpm --filter @shadowtube/proxy typecheck` | tsc proxy |

### Переменные окружения (mobile)

- `EXPO_PUBLIC_PROXY_URL` — URL proxy. Эмулятор Android: `http://10.0.2.2:8787`. Физическое устройство: `http://<IP-Mac>:8787`. Не используйте `localhost` с телефона/эмулятора на хосте без маппинга.
- Дублируется в `apps/mobile/app.config.ts` → `extra.proxyUrl`.

Gemini API key **не** в env — только BYOK в `expo-secure-store` (экран Settings).

## Архитектура и поток данных

```
[Home: URL] → extractVideoId()
    → GET proxy /metadata + /transcript
    → chunk(segments) в apps/mobile/src/chunking/chunker.ts
    → SQLite (videos, chunks, sessions)
    → [Session screen]

[Session] → YouTubePlayerView (react-native-youtube-iframe)
    → setInterval 150ms: getCurrentTime() >= chunk.end → pause, seekTo(start)
    → TranscriptView: tap word → TranslationSheet → Gemini API (с телефона)
    → vocabulary repo
```

**Proxy обязателен:** YouTube transcript API недоступен с мобилки (CORS). Локально работает `node-server.ts` + пакет `youtube-transcript`. CF Worker (`index.ts`) — запасной edge-вариант, на практике часто пустой ответ без cookies.

## Карта важных файлов (mobile)

| Путь | Роль |
|------|------|
| `app/(tabs)/index.tsx` | Home: URL, история, resume |
| `app/(tabs)/settings.tsx` | BYOK Gemini, test key |
| `app/(tabs)/vocabulary.tsx` | Словарь, поиск, long-press delete |
| `app/session/[videoId].tsx` | Сессия shadowing, плеер, чанки |
| `src/chunking/chunker.ts` | **Чанкинг по предложениям/паузам** — не ломать границы фраз |
| `src/api/transcript.ts` | HTTP-клиент к proxy |
| `src/api/gemini.ts` | Gemini generateContent, en→ru |
| `src/db/schema.ts` | Drizzle-схема |
| `src/db/client.ts` | expo-sqlite + миграции SQL |
| `src/db/repos/*.ts` | CRUD |
| `src/components/YouTubePlayer.tsx` | IFrame; `play` только через prop `playing` |
| `src/components/TranscriptView.tsx` | Текущий чанк + соседи dim |
| `src/components/TranslationSheet.tsx` | Modal + перевод + save |

Алиас импортов: `@/` → корень `apps/mobile`. Shared: `@shadowtube/shared`.

Metro: `apps/mobile/metro.config.js` — watchFolders на monorepo root.

## Proxy API

```
GET /transcript?videoId=ID&lang=en
→ { segments: [{ start, duration, text }], hasManualCaptions, language }

GET /metadata?videoId=ID
→ { title, channel, durationSec, thumbnail }
```

CORS: `*`. Node-сервер слушает `PORT` (default 8787).

## SQLite (локально на устройстве)

- `videos` — метаданные, last_opened_at
- `chunks` — idx, start_sec, end_sec, text (per video)
- `sessions` — last_chunk_idx (resume)
- `vocabulary` — word, context, translation; поля SM-2 — **Phase 2, не трогать в MVP**

## Принятые решения (не менять без явного запроса)

- **Платформа MVP:** Android only (Expo).
- **Языки:** en → ru, хардкод.
- **Чанкинг:** по пунктуации или паузам между сегментами; **никогда** резать фразу по `maxSec` таймером.
- **Плеер:** только YouTube IFrame (`seekTo` / `play` prop), без скачивания видео.
- **Перевод:** Gemini с телефона, BYOK; ключ в SecureStore.
- **Авторизация / sync / Whisper / запись голоса / SRS** — out of scope MVP.

## Стиль кода

- TypeScript strict, минимальный diff, без лишней абстракции.
- Следовать существующим паттернам в `src/` (repos, zustand только для settings).
- Комментарии — только неочевидная логика (чанкинг, pause-on-end).
- Не редактировать `.cursor/plans/*.plan.md` unless asked.
- Expo SDK **56** — при сомнениях: https://docs.expo.dev/versions/v56.0.0/

## Типичные задачи агента

1. **Баг субтитров** → проверить proxy (`curl localhost:8787/transcript?videoId=…`), `EXPO_PUBLIC_PROXY_URL`, использовать `pnpm proxy:dev` (Node), не CF.
2. **Баг плеера** → `session/[videoId].tsx` + `YouTubePlayer.tsx`; pause-on-end через interval, не `onStateChange` alone.
3. **Новая фича словаря** → `vocabulary` schema + `app/(tabs)/vocabulary.tsx`.
4. **Изменение чанков** → `chunker.ts` + `chunker.test.ts` (обязательно тесты).

## Шаблонный мусор Expo

`apps/mobile/app/(tabs)/two.tsx`, `app/modal.tsx`, старые `components/Themed.tsx` — скрыты или не используются; не расширять без нужды. Новые экраны — в `app/` по Expo Router.

## EAS / production

`apps/mobile/eas.json` — профили `preview` (APK), `production`. `app.config.ts` — `android.package`: `com.shadowtube.app`.
