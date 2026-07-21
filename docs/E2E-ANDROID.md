# E2E: pause-on-end (Android)

Автоматическая проверка остановки видео в конце чанка. Агент читает логи через proxy `/log/tail`, а не «смотрит» видео.

## 1. Android SDK + эмулятор

### Вариант A: Homebrew (уже установлено на этой машине)

```bash
brew install --cask android-commandlinetools android-platform-tools
# Java: brew install --cask temurin (если нет java)

export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# AVD уже создан: ShadowTube_Pixel_6 (Pixel 6, API 34, Play Store)
pnpm emulator          # или: ./scripts/start-emulator.sh
```

`~/.zshrc` уже содержит `ANDROID_HOME` и PATH.

### Вариант B: Android Studio (GUI)

1. Установите [Android Studio](https://developer.android.com/studio) → SDK Platform + **Android 14** system image (Google APIs / Play Store).
2. Device Manager → Create Virtual Device → Pixel 6.
3. Добавьте в `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

### Проверка

```bash
adb devices
emulator -list-avds   # ShadowTube_Pixel_6
```

Expo Go SDK 56 **не в Play Store** — ставится APK без Google sign-in:

```bash
pnpm expo-go:install
# или вручную:
# curl -fL -o /tmp/Expo-Go.apk \
#   https://github.com/expo/expo-go-releases/releases/download/Expo-Go-56.0.1/Expo-Go-56.0.1.apk
# adb install -r /tmp/Expo-Go.apk
```

## 2. Запуск dev-окружения

```bash
# Терминал 1 — proxy (обязателен для devLog)
pnpm proxy:dev

# Терминал 2 — Metro + эмулятор (EXPO_PUBLIC_PROXY_URL уже в pnpm mobile:android)
pnpm mobile:android

# Терминал 3
pnpm e2e:pause:open
```

На экране **dev/pause-test** — зелёный баннер «E2E pause-test», через ~5s «⏸ СТОП» (только для дефолтного тест-видео `M7lc1UVf-VE`).

### dev/pause-test vs Home (обычная сессия)

| | **Home → session** | **dev/pause-test** |
|---|---|---|
| Назначение | Реальное shadowing | Отладка pause-on-end, E2E |
| Чанки | SQLite + proxy при первом открытии | Фикстуры (дефолт) или proxy/SQLite по `videoId` |
| Баннер | нет | зелёный E2E-баннер |
| Auto-replay | нет | да, через 2s после ready |

**Своё видео на dev-экране** (нужен `pnpm proxy:dev`):

```bash
# Deep link (Metro host = LAN IP Mac, см. pnpm e2e:pause:open)
adb shell am start -a android.intent.action.VIEW \
  -d "exp://<LAN-IP>:8081/--/dev/pause-test?videoId=vif8NQcjVf0"
```

Или в Expo Go вручную откройте маршрут `/dev/pause-test?videoId=vif8NQcjVf0`.

**Обычная сессия** — вставьте URL на Home и «Начать» → `/session/vif8NQcjVf0` (без зелёного баннера).

Кнопка **← Home** и Android hardware back возвращают на Home.

### Звук на эмуляторе

В коде плеера явно `mute={false}`, `volume={100}`. Если звука всё равно нет:

1. Громкость Mac / клавиши ↑
2. Эмулятор: боковая панель (⋯) → **Extended controls** → **Settings** → Volume
3. Android: Settings → Sound — media volume не на нуле
4. Cold boot эмулятора иногда «глушит» WebView до первого user gesture — нажмите **Replay**

- **proxy** с эмулятора → `http://10.0.2.2:8787`
- **Metro** (JS) → LAN IP Mac (как `expo start --android`)

## 3. Log-driven E2E

Dev-маршрут: `/dev/pause-test` — по умолчанию фиксированные чанки `M7lc1UVf-VE`, auto-replay после `onReady`. Опционально: `?videoId=XXX` (см. §2).

```bash
pnpm e2e:pause:open   # рекомендуется
pnpm e2e:pause        # если экран уже открыт
pnpm e2e:pause:maestro
```

**PASS** — `watcher_stop` в ожидаемом временном окне (exit 0).  
**FAIL** — нет stop или вышло за окно; tail лога в stdout (exit 1).

Логи: `curl http://localhost:8787/log/tail` или `/tmp/shadowtube-dev.log`.

### Интерпретация событий в логе

```bash
curl -s http://localhost:8787/log/tail | grep '\[e2e\]'
```

| Событие | Значение | Action |
|---------|----------|--------|
| `replay_start` | Replay начался (компонент SessionScreenContent) | OK, ожидаем tick'и |
| `watcher_tick` | Интервал 150ms работает, bridge (getCurrentTime) отвечает | OK, плеер живой |
| `watcher_stop` | Логика решила остановить (вышли из чанка) | OK, ожидаем pause |
| `player_state: playing` **после** `watcher_stop` | Видео **продолжает играть** после stop → баг pause | FAIL, чинить `stopAt` pulse в YouTubePlayer |
| `player_state: paused` **после** `watcher_stop` | Видео успешно спаузировано | OK |
| Нет `watcher_tick` после `replay_start` | Bridge завис или не отвечает | FAIL, чинить bridgeTime.ts (timeout/frequency) |

Пример реальной ошибки: `[e2e] watcher_stop` → тут же `[e2e] player_state: playing` = pause не дошёл до iframe.

## 4. Maestro

```bash
curl -Ls https://get.maestro.mobile.dev | bash
```

Flow: [`.maestro/pause-on-end.yaml`](../.maestro/pause-on-end.yaml)

Deep link (adb) — Metro host = **LAN IP Mac**, не `10.0.2.2`:

```bash
# e2e-pause.mjs подставляет IP автоматически
pnpm e2e:pause:open
```

## 4a. События фраз и повторений

Кроме pause-on-end через `/log/tail` видно весь новый цикл:

| Событие | Когда |
|---------|-------|
| `select` | тап по слову; `selected:false` — выделение снято |
| `translate_phrase` | нажата «Перевести», в `words` — размер фразы |
| `chunk_ru` / `save_chunk` | тумблер RU / «＋ чанк» |
| `review_open` | открыта вкладка повторений, в `due` — размер очереди |
| `review_show_answer`, `review_grade`, `review_done` | ход повторения |

```bash
curl -s http://localhost:8787/log/tail | grep -E 'select|review_'
```

Перевод требует **своего ключа Gemini** (BYOK, Настройки) — без него
`PhraseSheet` честно показывает «Добавьте Gemini API key», а не падает.
Уведомления в Expo Go недоступны, только в APK — см. [SRS.md](./SRS.md).

## 5. Unit-тесты watcher (без устройства)

```bash
pnpm test:mobile
```

Файлы: `apps/mobile/src/session/endWatcherLogic.ts` + `.test.ts`.

## 6. Цикл агента

1. Правка `session/` или `SessionScreenContent`
2. Hot reload в Metro (или `r`)
3. `pnpm e2e:pause --auto-open`
4. По exit code — следующая итерация

Полный `-c` (clear cache) только при изменении native/config.
