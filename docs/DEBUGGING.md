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

## 3. Expo Go — версия SDK

Проект на **Expo SDK 56**. В Play Store установите **последний Expo Go**. Старый Expo Go даёт мгновенный crash без понятного текста.

## 4. Телефон: открыть dev menu

В Expo Go встряхните телефон → **Open JS debugger** / **Show Element Inspector** → смотрите Console в Chrome DevTools (если включён remote JS debugging).

Без adb: `adb logcat` недоступен, пока не настроите Android SDK (см. README).

## 5. Частые причины

| Симптом | Решение |
|---------|---------|
| Crash сразу при открытии | Обновить Expo Go; перезапуск `pnpm start:clear` |
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
