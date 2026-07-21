# Claude Code — ShadowTube

Перед любой задачей прочитай **[AGENTS.md](./AGENTS.md)** в корне репозитория: структура monorepo, поток данных, карта файлов, MVP scope, команды запуска.

## Быстрые факты

- **Продукт:** language shadowing с YouTube (Android, Expo 56).
- **Два процесса в dev:** (1) `pnpm proxy:dev` на :8787 — должен **висеть** в терминале; (2) `pnpm mobile` + `EXPO_PUBLIC_PROXY_URL=http://10.0.2.2:8787` для эмулятора.
- **Критичный модуль:** `apps/mobile/src/chunking/chunker.ts` — резка по предложениям, не по секундам.
- **Proxy для локалки:** `apps/proxy/src/node-server.ts` (`youtube-transcript`), не CF Worker.
- **Не коммитить** без явной просьбы пользователя. Не править plan-файлы в `.cursor/plans/`.
- **IDE:** Docs поддерживают Cursor и Claude Code; источник истины — AGENTS.md; `.cursor/rules/` = entry points для Cursor.

## Где что искать

| Задача | Файл |
|--------|------|
| Ввод URL, история | `apps/mobile/app/(tabs)/index.tsx` |
| Сессия, плеер | `apps/mobile/app/session/[videoId].tsx` |
| Выделение фразы | `apps/mobile/src/session/spanSelection.ts` |
| Промпты перевода | `apps/mobile/src/api/geminiPrompts.ts` |
| Повторения (SM-2, цепочка) | `apps/mobile/src/srs/*`, `app/(tabs)/review.tsx` — см. [docs/SRS.md](./docs/SRS.md) |
| Дизайн-токены, тосты | `apps/mobile/src/ui/*` |
| Субтитры с YouTube | `apps/proxy/src/node-server.ts` |
| API-контракты типов | `packages/shared/src/types.ts` |
| Gemini BYOK | `apps/mobile/src/api/gemini.ts`, `app/(tabs)/settings.tsx` |

Подробности — в [AGENTS.md](./AGENTS.md) и [README.md](./README.md).

## Дебаг pause-on-end (цикл агента)

На Android WebView `play=false` часто не паузит YouTube iframe из-за bridge-особенностей.

```bash
# Терминал 1: proxy (обязателен для логов)
pnpm proxy:dev

# Терминал 2: Metro + эмулятор
pnpm mobile:android

# Терминал 3: E2E проверка (после правок кода)
pnpm e2e:pause:open
# exit 0 = PASS, exit 1 = FAIL с tail логов
```

**Логи:** `curl -s http://localhost:8787/log/tail | grep '\[e2e\]'` — ищите `replay_start` → `watcher_tick` → `watcher_stop` → `player_state: playing` (баг) или `paused` (OK).

**Ключевые файлы:** 
- `apps/mobile/src/session/SessionScreenContent.tsx` — watcher + replay
- `apps/mobile/src/components/YouTubePlayer.tsx` — `stopAt()` pulse pause
- `apps/mobile/src/session/endWatcherLogic.ts` — pure logic (unit-тесты)

**Полный контекст:** [docs/E2E-ANDROID.md](./docs/E2E-ANDROID.md)
