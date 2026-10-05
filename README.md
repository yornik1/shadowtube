# ShadowTube

Android-приложение для **language shadowing** с YouTube: вставьте ссылку → субтитры режутся по предложениям → петля воспроизведения чанков → выделение фразы тап-тапом → перевод в контексте через Gemini (BYOK) → карточка в словарь → интервальные повторения (FSRS).

**Для AI-ассистентов (Cursor / Claude Code):** [AGENTS.md](./AGENTS.md) · [CLAUDE.md](./CLAUDE.md)

**Отладка / Something went wrong:** [docs/DEBUGGING.md](./docs/DEBUGGING.md)  
**E2E pause-on-end (эмулятор + логи):** [docs/E2E-ANDROID.md](./docs/E2E-ANDROID.md)

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
# По умолчанию клиент смотрит на AWS proxy; для локального proxy:
# SHADOWTUBE_USE_LOCAL_PROXY=1 pnpm dev
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
SHADOWTUBE_USE_LOCAL_PROXY=1 pnpm mobile   # expo start; нажмите a = эмулятор, QR = телефон
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

### Вариант 3: E2E pause-on-end (эмулятор)

```bash
pnpm proxy:dev                              # терминал 1
EXPO_PUBLIC_PROXY_URL=http://10.0.2.2:8787 pnpm mobile:android   # терминал 2
pnpm e2e:pause:open                         # терминал 3 — adb + assert по логам
```

Подробнее: [docs/E2E-ANDROID.md](./docs/E2E-ANDROID.md)

### Вариант 4: браузер (ограниченно)

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
| `EXPO_PUBLIC_PROXY_URL` | AWS proxy `:8788` | URL proxy. Нужно только для переопределения. Эмулятор: `http://10.0.2.2:8787` |
| `SHADOWTUBE_USE_LOCAL_PROXY` | unset | `1` включает авто-LAN proxy `http://<IP-Mac>:8787` в `app.config.ts` |
| `PROXY_URL` | `http://localhost:8787` | Только для тестов (`pnpm test`) |

---

## Полезные команды

```bash
pnpm dev              # proxy + mobile вместе
pnpm proxy:dev        # только proxy (Node, порт 8787)
pnpm mobile           # только expo start
pnpm mobile:android   # expo start --android
SHADOWTUBE_USE_LOCAL_PROXY=1 pnpm mobile  # dev-клиент против локального proxy
pnpm mobile:update    # OTA update в EAS channel preview (JS/assets only)
pnpm test             # все тесты
pnpm test:proxy       # тесты proxy
pnpm test:mobile      # тесты mobile
pnpm e2e:pause        # E2E pause (логи; replay вручную или dev route)
pnpm e2e:pause:open   # E2E + adb open /dev/pause-test
pnpm e2e:pause:maestro # Maestro UI + assert по логам
pnpm typecheck        # TypeScript проверка везде
```

---

## API proxy

| Endpoint | Params | Response |
|----------|--------|----------|
| `GET /transcript` | `videoId`, `lang=en` | `{ segments, hasManualCaptions, language }` |
| `GET /metadata` | `videoId` | `{ title, channel, durationSec, thumbnail }` |

CORS: `*`. Порт: `PORT` env var (дефолт 8787).

### Production proxy on EC2

GitHub Actions workflow: `.github/workflows/deploy-ec2.yml`.

- EC2 path: `/home/ubuntu/shadowtube`
- Docker Compose service: `shadowtube-proxy`
- Container port: `8787`
- Public host port: `8788`
- APK/default proxy URL: `EXPO_PUBLIC_PROD_PROXY_URL` (build-time env, e.g. `http://<your-proxy-host>:8788`)

Manual deploy after opening AWS Security Group inbound `8788/tcp`:

```bash
gh workflow run deploy-ec2.yml --repo yornik1/shadowtube \
  -f deploy_path=/home/ubuntu/shadowtube \
  -f git_ref=main
```

---

## Сборка APK для телефона

### Вариант 1: EAS (облако, рекомендуется)

```bash
cd apps/mobile
npx eas-cli login          # один раз
npx eas-cli init --force   # один раз, если проект ещё не привязан

# По умолчанию в APK зашивается AWS proxy на :8788:
pnpm build:apk

# Для локального proxy вместо AWS:
EXPO_PUBLIC_PROXY_URL=http://<IP-Mac>:8787 pnpm build:apk
# или из apps/mobile: npx eas build -p android --profile preview
```

Скачайте `.apk` по ссылке из терминала или на [expo.dev](https://expo.dev) → проект **shadowtube** → Builds.

Перед использованием APK нужен доступный AWS proxy на `:8788` либо свой `EXPO_PUBLIC_PROXY_URL`, зашитый при сборке.

### OTA-обновления без переустановки APK

Новые APK собираются с EAS Update (`expo-updates`) и каналом `preview`.
OTA подходит для JS/asset-изменений: экраны, логика, fallback proxy, тексты.
Если меняются native modules, Expo plugins, AndroidManifest, SDK или зависимости с native-кодом — нужен новый APK.

Опубликовать JS-update для установленных preview APK:

```bash
pnpm mobile:update -m "Fix proxy fallback"
# эквивалентно:
# cd apps/mobile
# npx eas-cli update --channel preview --environment preview --platform android --message "Fix proxy fallback"
```

Кто получит update: любой установленный APK ShadowTube, собранный с `channel: preview`
и совместимым `runtimeVersion`. Это не публичный “хэштег”, но и не приватный per-user
доступ: если APK установлен у человека, он сможет получить updates этого канала.

### Вариант 2: локально (без EAS)

Требует JDK 17 и Android SDK (`brew install openjdk@17`).

```bash
cd apps/mobile
npx expo prebuild --platform android
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

Или: `pnpm build:apk:local` (скрипт в корне).

---

## MVP scope

- en → ru перевод (хардкод)
- Чанкинг по предложениям / паузам (не по таймеру)
- Resume сессии, локальный словарь
- Интервальные повторения (FSRS), автосоздание карточек — см. [docs/SRS.md](docs/SRS.md)
- **Не в MVP:** Whisper fallback, запись голоса, auth/sync, экспорт данных
