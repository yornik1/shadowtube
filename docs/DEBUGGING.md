# Отладка ShadowTube

## Эмулятор у меня (агента) недоступен

На машине без `adb` / Android Studio агент **не может** открыть эмулятор за вас. Отладка: **Metro-терминал** + **экран ошибки в приложении** (после обновления — виден текст `error.message` и stack).

## 1. Терминал Metro (главный источник)

```bash
cd apps/mobile
pnpm start:clear
```

После краша на телефоне в этом терминале появится красный **ERROR** и stack trace. Скопируйте его целиком.

Включить подробные логи:

```bash
EXPO_DEBUG=1 pnpm start:clear
```

## 2. Экран «Something went wrong»

После pull: на экране ошибки Expo Router показывается **сообщение** и кнопка «Повторить». Сфотографируйте или перепишите `error.message`.

## 3. Expo Go — версия SDK (частая причина «ничего не видно»)

Проект на **Expo SDK 56**. В Play Store установите **последний Expo Go**.

Если версии не совпадают, Expo Go показывает свой экран «Something went wrong» **без нашего текста** — это не баг приложения.

**Проверка:** после обновления кода при запуске сверху должна быть синяя полоска `SDK 56 · runtime …`. Если её нет — JS не стартует (несовместимый Expo Go или краш до React).

**Узнать текущую версию Expo Go:** открой Expo Go → шестерёнка вверху → About → SDK Version.

**Если SDK не совпадает:** собери dev build через EAS:

```bash
cd apps/mobile
npx eas build --profile development --platform android
```

## 4. Телефон: открыть dev menu

В Expo Go встряхните телефон → **Open JS debugger** / **Show Element Inspector** → смотрите Console в Chrome DevTools (если включён remote JS debugging).

Без adb: `adb logcat` недоступен, пока не настроите Android SDK (см. README).

## 5. Частые причины

| Симптом | Решение |
|---------|---------|
| **`Failed to download remote update`** | Два Metro запущены одновременно. Закройте все терминалы с expo, запустите только `pnpm mobile` из корня |
| **`Failed to download remote update`** (альт.) | Expo Go лезет на EAS — `updates.enabled: false` в app.config.ts уже выставлен |
| Crash сразу при открытии | Обновить Expo Go; перезапуск `pnpm mobile` из корня |
| «Ошибка базы данных» на главной | SQLite — текст ошибки на экране + Metro |
| Сеть при «Начать» | `EXPO_PUBLIC_PROXY_URL=http://IP-Mac:8787`, proxy: `pnpm proxy:dev` |
| Открыли localhost:8081 в Chrome | Только Android / Expo Go, не браузер |

## 6. Android Studio (если настроите adb)

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
adb logcat *:E | grep -i "ReactNative\|ShadowTube\|expo"
```

В Metro нажмите **`a`** — запуск на эмуляторе.

## 7. Проверка bundle без телефона

```bash
cd apps/mobile
npx expo export --platform android --output-dir /tmp/shadowtube-export
```

Если падает здесь — ошибка сборки; если ок — проблема runtime на устройстве.
