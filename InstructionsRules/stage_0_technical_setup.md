# Технічне налаштування Етапу 0

Цей документ фіксує виконані налаштування Етапу 0 для PLM-модуля.

## Структура монорепозиторію
Проєкт ініціалізовано як монорепозиторій:
- `frontend/` - React + Vite + TypeScript додаток.
- `supabase/` - конфігурація та міграції бази даних Supabase.
- `InstructionsRules/` - документація агента (цей файл, маніфест тощо).
- `events-schema/` - контракти (`mes-contract.md`, `fsm-contract.md`).
- `package.json` у корені для спільних скриптів (`npm run dev`, `npm run build`, `npm run supabase:start`).

## Налаштування Frontend
- React 18 + Vite 6 + TypeScript (`strict: true`).
- Підключено `@supabase/supabase-js`.
- Налаштовано **Sentry** (`@sentry/react`) для відстеження помилок. 
  - `DSN` береться з `.env.local` (`VITE_SENTRY_DSN`).
  - `environment` автоматично встановлюється з `import.meta.env.MODE` (dev/prod).
- `.gitignore` містить патерни: `.env`, `.env.local`, `.env.*.local`, а також ігнори для `supabase/.branches`.

## База даних (Supabase)
- Локальний проєкт Supabase ініціалізовано.
- Створено першу порожню міграцію `initial_schema`.

## Контрольна точка
- Локальні сервіси Docker для Supabase запускаються через `npx supabase start`.
- Фронтенд підключається до бази (перевірка `supabase.auth.getSession()` на головній сторінці).
- Тестова помилка успішно відправляється в Sentry при натисканні кнопки "Test Sentry Error".
