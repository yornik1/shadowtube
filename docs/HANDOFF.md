# ShadowTube — handoff для нового агента

**Проект:** monorepo `shadowtube/` — Expo 56 Android + Node proxy (:8787) + Gemini/Gemma перевод.

## Запуск (телефон не видит Mac по LAN)

```bash
cd /Users/mich/PycharmProjects/shadowtube
pnpm tunnel   # proxy + ngrok + expo --tunnel --clear
```

Expo Go SDK 56 — APK с https://expo.dev/go (Play Store отстаёт).

## Тесты без телефона

```bash
pnpm proxy:dev &
pnpm test   # chunker + proxy integration
```

## Что уже сделано

- `pnpm tunnel` — один скрипт: proxy, ngrok, Metro tunnel
- `app.config.ts` — auto IP; `updates.enabled: false`
- Web-fix: `client.web.ts`, `home.web.tsx`, repos → `../client`
- Settings: ключ → `verifyApiKey` → список моделей из API; модель в SecureStore
- Перевод: batch на весь чанк + prefetch; кэш; race fix в TranslationSheet
- Дефолт модели: `gemini-2.5-flash-latest`, fallback gemma
- Session: границы чанка, pause-on-end, только Next/Prev меняют чанк, Replay для проигрывания

## Известные проблемы / проверить

1. **Плеер** — `getCurrentTime()` на Expo Go часто 0; fallback по wall-clock. Проверить что видео реально не уползает за чанк
2. **Перевод** — batch-промпт может быть медленным; Gemma иногда 500
3. **Tunnel** — ngrok URL меняется каждый раз; localtunnel больше не используется

## Ключевые файлы

| Файл | Роль |
|------|------|
| `scripts/tunnel.mjs` | dev через tunnel |
| `apps/mobile/app/session/[videoId].tsx` | плеер + чанки |
| `apps/mobile/src/api/gemini.ts` | перевод, модели, кэш |
| `apps/mobile/app/(tabs)/settings.tsx` | ключ + выбор модели |
| `apps/proxy/src/node-server.ts` | субтитры |
| `apps/mobile/src/chunking/chunker.ts` | нарезка (тесты обязательны) |

## MVP scope (не трогать без запроса)

en→ru, chunking по предложениям, BYOK Gemini, SQLite локально. Без SRS/auth/sync.

## Как использовать в Cursor

Новый чат (Cmd+L / New Chat) → вставь этот файл или скажи агенту: «прочитай `docs/HANDOFF.md` и продолжай с …». Старый чат можно закрыть — контекст не переносится автоматически.

Полный контекст проекта: [AGENTS.md](../AGENTS.md).
