# ShadowTube

Android-приложение для **language shadowing** с YouTube: вставьте ссылку → субтитры режутся по предложениям → петля воспроизведения чанков → тап по слову → перевод через Gemini (BYOK) → локальный словарь.

**Для AI-ассистентов (Cursor / Claude Code):** [AGENTS.md](./AGENTS.md) · [CLAUDE.md](./CLAUDE.md)

**Отладка / Something went wrong:** [docs/DEBUGGING.md](./docs/DEBUGGING.md)

---

## Структура monorepo

```
shadowtube/              ← КОРЕНЬ: все pnpm-команды запускать здесь
  apps/mobile/           ← Expo React Native (Android)
  apps/proxy/            ← Node.js proxy-сервер (субтитры + metadata)
  packages/shared/       ← Общие TypeScript-типы
```

> ⚠️ Все команды ниже запускаются **из корня** (`/shadowtube/`), не из `apps/`.

---

## Быстрый старт

```bash
pnpm install
```

### Запуск всего одной командой

```bash
pnpm dev
# Запускает proxy (порт 8787) + expo start параллельно.
# IP определяется автоматически — EXPO_PUBLIC_PROXY_URL выставлять не нужно.
```

### Если телефон не достучивается до Mac (другая сеть / AP-isolation)

```bash
pnpm tunnel
```

Делает всё автоматически:
1. Поднимает прокси на `:8787`
2. Открывает **ngrok тоннель** для прокси → публичный HTTPS URL
3. **Печатает QR** этого URL прямо в терминале — сканируй браузером телефона один раз (разблокировка ngrok)
4. Запускает `expo start --tunnel` с правильным `EXPO_PUBLIC_PROXY_URL`
5. Показывает QR Expo для сканирования в Expo Go

Требует: `ngrok` (`brew install ngrok`), `@expo/ngrok` (уже в зависимостях).

Откройте в **Expo Go** на телефоне (тот же Wi-Fi) или запустите эмулятор в Android Studio → нажмите `a` в терминале.

### По отдельности

```bash
# Терминал 1 — proxy (субтитры)
pnpm proxy:dev        # http://localhost:8787

# Терминал 2 — мобилка
pnpm mobile           # expo start; нажмите a = эмулятор, QR = телефон
```

---

## Тестирование без телефона

### Вариант 1: тесты (рекомендуется для LLM/CI)

```bash
# Запустить proxy, потом в другом терминале:
pnpm test             # unit + integration, 19 тестов

# Или по отдельности:
pnpm test:proxy       # тесты proxy HTTP (unit + реальный YouTube)
pnpm test:mobile      # chunker unit + integration flow
```

Интеграционные тесты автоматически **пропускаются**, если proxy не запущен — `pnpm test` всегда завершается без ошибок.

Полный прогон (proxy должен работать):
```bash
pnpm proxy:dev &
PROXY_URL=http://localhost:8787 pnpm test
```

### Вариант 2: curl прокси

```bash
pnpm proxy:dev   # в отдельном терминале

# Проверить transcript:
curl "http://localhost:8787/transcript?videoId=dQw4w9WgXcQ&lang=en" | jq '.segments | length'

# Проверить metadata:
curl "http://localhost:8787/metadata?videoId=dQw4w9WgXcQ" | jq '{title, channel}'
```

### Вариант 3: браузер (ограниченно)

```bash
pnpm --filter @shadowtube/mobile web
# Открывает http://localhost:8081 в браузере.
# Экраны с плеером показывают "Android only" — YouTube IFrame не работает в браузере.
# Полезно для проверки что app загружается без крашей.
```

---

## Настройка приложения

1. Вкладка **Настройки** → вставьте Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey)) → **Сохранить** → **Проверить ключ**.
2. **Главная** → вставьте YouTube URL → **Начать**.

---

## Переменные окружения

| Переменная | Дефолт | Описание |
|---|---|---|
| `EXPO_PUBLIC_PROXY_URL` | авто (LAN IP:8787) | URL proxy. Нужно только для переопределения. Эмулятор: `http://10.0.2.2:8787` |
| `PROXY_URL` | `http://localhost:8787` | Только для тестов (`pnpm test`) |

---

## Полезные команды

```bash
pnpm dev              # proxy + mobile вместе
pnpm proxy:dev        # только proxy (Node, порт 8787)
pnpm mobile           # только expo start
pnpm mobile:android   # expo start --android
pnpm test             # все тесты
pnpm test:proxy       # тесты proxy
pnpm test:mobile      # тесты mobile
pnpm typecheck        # TypeScript проверка везде
```

---

## API proxy

| Endpoint | Params | Response |
|----------|--------|----------|
| `GET /transcript` | `videoId`, `lang=en` | `{ segments, hasManualCaptions, language }` |
| `GET /metadata` | `videoId` | `{ title, channel, durationSec, thumbnail }` |

CORS: `*`. Порт: `PORT` env var (дефолт 8787).

---

## EAS Build (APK)

```bash
cd apps/mobile
npx eas-cli login
npx eas build -p android --profile preview
```

---

## MVP scope

- en → ru перевод (хардкод)
- Чанкинг по предложениям / паузам (не по таймеру)
- Resume сессии, локальный словарь
- **Не в MVP:** Whisper fallback, запись голоса, auth/sync, SRS
