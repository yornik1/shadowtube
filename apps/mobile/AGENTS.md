# @shadowtube/mobile

Expo 56 + React Native + Expo Router. **Только Android** в MVP.

Корневой контекст monorepo: [../../AGENTS.md](../../AGENTS.md).

## Expo

Документация SDK: https://docs.expo.dev/versions/v56.0.0/ — сверяй API перед использованием новых модулей.

## Структура

```
app/                    # Expo Router (экраны)
  (tabs)/index.tsx      # Home
  (tabs)/settings.tsx   # BYOK
  (tabs)/vocabulary.tsx
  session/[videoId].tsx # Shadowing session
src/
  chunking/             # pure chunker + vitest
  api/                  # transcript (proxy), gemini
  db/                   # drizzle + sqlite repos
  components/           # Player, Transcript, TranslationSheet
  store/                # zustand (settings only)
  secure/               # SecureStore wrapper
```

Импорты: `@/src/...` или `@/app/...`. Shared types: `@shadowtube/shared`.

## Запуск

```bash
# из корня monorepo, proxy уже на :8787
export EXPO_PUBLIC_PROXY_URL=http://10.0.2.2:8787
pnpm --filter @shadowtube/mobile start
```

## YouTube player

`react-native-youtube-iframe`: ref даёт только `seekTo`, `getCurrentTime`. Воспроизведение — prop `play={playing}`. Pause-on-end в `session/[videoId].tsx` через `setInterval(150ms)`.

Peer для web-сборки Metro: `react-native-web-webview` (уже в dependencies). MVP — только Android. `pnpm start` = `expo start` (без `--android`, чтобы не требовать adb сразу); эмулятор — клавиша `a` после настройки SDK.

## Не трогать без запроса

- `app/(tabs)/two.tsx` — скрыт (`href: null`)
- Шаблонные `components/Themed.tsx`, `modal.tsx`
