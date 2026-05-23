# ShadowTube

Android-приложение для **language shadowing** с YouTube: вставьте ссылку → субтитры режутся по предложениям → петля воспроизведения чанков → тап по слову → перевод через Gemini (BYOK) → локальный словарь.

**Для AI-ассистентов (Cursor / Claude Code):** [AGENTS.md](./AGENTS.md) · [CLAUDE.md](./CLAUDE.md)

**Отладка / Something went wrong:** [docs/DEBUGGING.md](./docs/DEBUGGING.md)

## Структура

```
shadowtube/
  apps/mobile/     # Expo React Native (Android)
  apps/proxy/      # Cloudflare Worker (субтитры + metadata)
  packages/shared/ # Общие TypeScript-типы
```

## Требования

- Node.js 20+
- pnpm 9+
- Android Studio / эмулятор или физическое устройство
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) для proxy
- Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey))

## Быстрый старт

### 1. Установка

```bash
pnpm install
```

### 2. Proxy (субтитры)

**Локальная разработка** (Node + `youtube-transcript`, рекомендуется):

```bash
pnpm proxy:dev
# http://localhost:8787
```

**Cloudflare Worker** (edge, может не получать сабы без cookies):

```bash
pnpm proxy:cf
cd apps/proxy && pnpm deploy
```

### 3. Mobile

```bash
# Для Android-эмулятора localhost → 10.0.2.2
export EXPO_PUBLIC_PROXY_URL=http://10.0.2.2:8787

cd apps/mobile
pnpm start          # Metro; в консоли нажмите `a` для эмулятора
pnpm start:clear    # то же с очисткой кеша (-c), не ---c
```

**Ошибка `spawn adb ENOENT`:** не найден Android SDK. Установите [Android Studio](https://developer.android.com/studio), в SDK Manager включите *Android SDK Platform-Tools*, затем в `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

Перезапустите терминал, проверьте: `adb devices`. Запустите эмулятор в Android Studio → снова `pnpm start` → `a`.

Альтернатива без adb на Mac: **Expo Go** на телефоне (тот же Wi‑Fi), отсканировать QR из `pnpm start` (без `--android`).

На физическом устройстве укажите IP машины: `EXPO_PUBLIC_PROXY_URL=http://192.168.x.x:8787`.

### 4. Настройка приложения

1. Откройте вкладку **Настройки**.
2. Вставьте Gemini API key → **Сохранить** → **Проверить ключ**.
3. На **Главной** вставьте YouTube URL → **Начать**.

## EAS Build (APK)

```bash
cd apps/mobile
npx eas-cli login
npx eas build -p android --profile preview
```

Профили в [`apps/mobile/eas.json`](apps/mobile/eas.json): `preview` (APK, internal), `production`.

## Тесты

```bash
cd apps/mobile && pnpm test
```

## API (Worker)

| Endpoint | Params | Response |
|----------|--------|----------|
| `GET /transcript` | `videoId`, `lang=en` | `{ segments, hasManualCaptions, language }` |
| `GET /metadata` | `videoId` | `{ title, channel, durationSec, thumbnail }` |

## MVP scope

- en → ru перевод (хардкод)
- Чанкинг по предложениям / паузам (не по таймеру)
- Resume сессии, локальный словарь
- **Не в MVP:** Whisper fallback, запись голоса, auth/sync, SRS

## Лицензия

Private / MIT — на ваш выбор.
