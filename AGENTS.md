# ShadowTube — контекст для AI-агентов (Cursor, Claude Code)

Мобильное Android-приложение для **language shadowing** с YouTube. Пользователь вставляет ссылку → proxy отдаёт субтитры → клиент режет их на чанки по **предложениям/паузам** (не по таймеру) → YouTube IFrame играет отрезок → выделение **фразы** тап-тапом → перевод в контексте через **Gemini BYOK** → карточка в **SQLite** → **интервальные повторения** (SM-2) на отдельной вкладке.

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
- `EXPO_PUBLIC_FAKE_GEMINI=1` — **фейковый переводчик** (`src/api/geminiFake.ts`). Позволяет пройти цепочку «выделил фразу → сохранил → повторил» без ключа Gemini. Работает только в dev-сборке, переводы помечены «[тест]», в Настройках висит жёлтый баннер.

```bash
EXPO_PUBLIC_FAKE_GEMINI=1 SHADOWTUBE_USE_LOCAL_PROXY=1 pnpm mobile
```

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
    → TranscriptView: тап = слово, второй тап = диапазон (spanSelection.ts)
    → «Перевести» → PhraseSheet → Gemini (фраза + контекст чанка)
    → vocabulary repo (dueAt = now)

[Review] → listDue() → buildCard(mode) → оценка → sm2.nextReview()
    → streak.registerReview() → app_state
```

**Proxy обязателен:** YouTube transcript API недоступен с мобилки (CORS). Локально работает `node-server.ts` + пакет `youtube-transcript`. CF Worker (`index.ts`) — запасной edge-вариант, на практике часто пустой ответ без cookies.

## Карта важных файлов (mobile)

| Путь | Роль |
|------|------|
| `app/(tabs)/index.tsx` | Home: URL, история, resume |
| `app/(tabs)/review.tsx` | **Повторения:** очередь, цепочка дней, три оценки |
| `app/(tabs)/settings.tsx` | BYOK Gemini, режим карточек, напоминание |
| `app/(tabs)/vocabulary.tsx` | Словарь, поиск, long-press delete |
| `app/session/[videoId].tsx` | Сессия shadowing, плеер, чанки; `?chunk=N` — прыжок из карточки |
| `src/chunking/chunker.ts` | **Чанкинг по предложениям/паузам** — не ломать границы фраз |
| `src/api/transcript.ts` | HTTP-клиент к proxy |
| `src/api/gemini.ts` | Сеть, кэш, фолбэк моделей |
| `src/api/geminiPrompts.ts` | **Промпты и парсеры** — чистые, под тестами |
| `src/session/spanSelection.ts` | **Выделение фразы тап-тапом** — чистая логика |
| `src/srs/sm2.ts` | SM-2 на трёх оценках |
| `src/srs/streak.ts` | Цепочка дней, дневная норма (10) |
| `src/srs/cardModes.ts` | Три режима карточки (настройка) |
| `src/srs/notifications.ts` | Напоминание; expo-notifications грузится **лениво** |
| `src/db/schema.ts` | Drizzle-схема |
| `src/db/client.ts` | expo-sqlite + миграции SQL |
| `src/db/migrations.ts` | **Планировщик ALTER TABLE** — только ADD COLUMN |
| `src/db/repos/*.ts` | CRUD |
| `src/ui/theme.ts`, `src/ui/components.tsx` | Токены дизайна и примитивы — сырых hex в экранах быть не должно |
| `src/ui/toast.tsx` | Тосты вместо Alert (Alert прерывает сессию) |
| `src/components/YouTubePlayer.tsx` | IFrame; `play` только через prop `playing` |
| `src/components/TranscriptView.tsx` | Текущий чанк + соседи dim, подсветка выделения |
| `src/components/PhraseSheet.tsx` | Modal: перевод фразы, идиома, определение, save |

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
- `vocabulary` — карточка: `word` (английская сторона: фраза или чанк), `translation`, `definition_en`, `literal`, `note`, `context`, `kind`, тайминги источника (`start_sec`, `chunk_idx`) + SM-2 (`ef`, `interval_days`, `reps`, `due_at`, `lapses`). Колонка `phrase` — легаси MVP, не пишется.
- `app_state` — key/value: цепочка дней, дневная норма

**Миграции:** `CREATE TABLE IF NOT EXISTS` не добавляет колонки в уже существующую таблицу — новые поля приезжают через `ensureColumns()` (`client.native.ts` + `migrations.ts`). Только `ADD COLUMN`, никаких DROP; каждая NOT NULL колонка обязана иметь DEFAULT, иначе SQLite не сможет заполнить существующие строки.

## Принятые решения (не менять без явного запроса)

- **Платформа MVP:** Android only (Expo).
- **Языки:** en → ru, хардкод.
- **Чанкинг:** по пунктуации или паузам между сегментами; **никогда** резать фразу по `maxSec` таймером.
- **Плеер:** только YouTube IFrame (`seekTo` / `play` prop), без скачивания видео. `react-native-youtube-iframe` пропатчен (`patches/`): команды play/pause идут через `injectJavaScript` напрямую в YT API — `ref.postMessage()` на Android не доходит до страницы (диспатч в `document`, страница слушает `window`). Не убирать патч без проверки `pnpm e2e:stress`.
- **Перевод:** Gemini с телефона, BYOK; ключ в SecureStore. **Только фразовый** — пословный режим удалён: слово в вакууме ломается на идиомах, ради которых всё и затевалось. `definitionEn` запрашивается тем же вызовом, что и перевод, чтобы режим «толковый словарь» не стоил лишнего запроса.
- **SRS:** SM-2 на трёх оценках, интервалы общие для всех режимов карточки (одна запись = одна карточка). Дневная норма — 10 карточек, цепочка засчитывается при её выполнении. Подробности: [docs/SRS.md](./docs/SRS.md).
- **Уведомления:** `expo-notifications` импортируется **только лениво** (`require` внутри функции). Статический import роняет весь бандл в Expo Go — там модуль падает на импорте, а не на вызове.
- **Авторизация / sync / Whisper / запись голоса** — out of scope MVP.

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

## Субтитры: прямой путь, прокси — фолбэк

`src/api/transcript.ts` сначала зовёт `fetchDirectTranscript()` — запрос к YouTube InnerTube **с самого устройства** (клиенты IOS/TVHTML5, `src/api/youtubeCaptions.ts`), и только при ошибке идёт в прокси. Это и решило блокировки: запрос уходит с домашнего IP, а не с датацентрового, который YouTube режет как бота.

Прокси остаётся нужен для: dev-логов (`/log`, `/log/tail`), запасного пути когда прямой запрос упирается в LOGIN_REQUIRED, и старых сборок.

## Обновления (OTA)

`src/updates/otaUpdates.ts` + секция «Обновления» в Настройках.

```bash
pnpm ota          # = pnpm mobile:update, канал preview
```

- **По OTA едет:** JS, стили, тексты, картинки. Приложение проверяет обновление при старте молча, скачанное применяется при следующем запуске; в Настройках есть ручная проверка и кнопка перезапуска.
- **Требует новой сборки APK:** новые нативные модули и смена `version` в `app.config.ts` (`runtimeVersion.policy = "appVersion"` привязывает OTA к версии приложения).
- Модуль грузится лениво (`require` внутри функции) — как и `expo-notifications`, чтобы неудачный импорт не ронял бандл.

## EAS / production

`apps/mobile/eas.json` — профили `preview` (APK), `production`. `app.config.ts` — `android.package`: `com.shadowtube.app`.
