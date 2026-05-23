# Claude Code — ShadowTube

Перед любой задачей прочитай **[AGENTS.md](./AGENTS.md)** в корне репозитория: структура monorepo, поток данных, карта файлов, MVP scope, команды запуска.

## Быстрые факты

- **Продукт:** language shadowing с YouTube (Android, Expo 56).
- **Два процесса в dev:** (1) `pnpm proxy:dev` на :8787 — должен **висеть** в терминале; (2) `pnpm mobile` + `EXPO_PUBLIC_PROXY_URL=http://10.0.2.2:8787` для эмулятора.
- **Критичный модуль:** `apps/mobile/src/chunking/chunker.ts` — резка по предложениям, не по секундам.
- **Proxy для локалки:** `apps/proxy/src/node-server.ts` (`youtube-transcript`), не CF Worker.
- **Не коммитить** без явной просьбы пользователя. Не править plan-файлы в `.cursor/plans/`.

## Где что искать

| Задача | Файл |
|--------|------|
| Ввод URL, история | `apps/mobile/app/(tabs)/index.tsx` |
| Сессия, плеер | `apps/mobile/app/session/[videoId].tsx` |
| Субтитры с YouTube | `apps/proxy/src/node-server.ts` |
| API-контракты типов | `packages/shared/src/types.ts` |
| Gemini BYOK | `apps/mobile/src/api/gemini.ts`, `app/(tabs)/settings.tsx` |

Подробности — в [AGENTS.md](./AGENTS.md) и [README.md](./README.md).
