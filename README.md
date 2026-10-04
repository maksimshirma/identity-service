# identity-service

Self-hosted identity/auth сервис на [Better-Auth](https://www.better-auth.com/). Единая точка авторизации для нескольких продуктов — вместо того, чтобы каждый сервис хранил и валидировал юзеров сам.

Потребители:

- **hostyara** — shell-платформа семейного super-app. Нужен серьёзный multi-tenant auth: household-пространства, роли участников, инвайты, сессии/устройства, 2FA, permission-модель для подприложений.
- **financial-management-service** — личный финансовый трекер. Нужен только `user_id` в ответе при авторизации — локальных юзеров не хранит.

Почему Better-Auth, а не полноценный OAuth2/OIDC authorization server (Keycloak/Ory/Zitadel): подприложения hostyara получают `permissions` напрямую через SDK-контекст при монтировании (внутренняя capability-модель), а не через token exchange с отдельными OAuth-клиентами. Полноценный authorization server понадобится, если появятся сторонние разработчики, дёргающие backend API своими OAuth-клиентами — на старте такого нет.

## Архитектура

- `betterAuth()` инстанс — серверная логика (sign-up/sign-in/session/callback), конфигурируется плагинами.
- Kysely adapter — персистентность в Postgres, как и в соседних сервисах.
- Node + Hono — `auth.handler` монтируется в Hono-роут `/api/auth/*` через `@hono/node-server` (Web-standard Request/Response); Hono даёт маршрутизацию и middleware (CORS, logger, rate-limit) для своих ручек сверх Better-Auth.
- Плагины: `organization` (household-модель, роли, инвайты, Dynamic Access Control), `twoFactor`, `multiSession` (список сессий/устройств), `bearer` (non-browser потребители — MCP-серверы, другие backend-сервисы).
- Потребители ходят либо через HTTP (`/api/auth/get-session` — session introspection, как userinfo в OAuth), либо через фронтовый `createAuthClient()` (только hostyara shell).

## Стек

- TypeScript (ESM), pnpm
- Node.js — runtime
- Hono — маршрутизация и middleware (`@hono/node-server` под Node)
- Better-Auth
- Postgres — Kysely adapter

## Установка

```bash
git clone <repo_url>
cd identity-service
pnpm install
```

## Запуск

```bash
cp .env.example .env
docker compose up -d        # Postgres

pnpm dev            # tsx watch src/main.ts, http://localhost:3000
pnpm build          # tsc -> dist/
pnpm start          # node dist/main.js
pnpm check:types    # tsc --noEmit
```

## База данных

Две независимые миграционные дорожки на одной БД:

- **Схема Better-Auth** (`user`/`session`/`account`/`verification` + плагины) — через `@better-auth/cli`, SQL-файлы лежат в `better-auth_migrations/`:
  ```bash
  npx @better-auth/cli generate -y   # перегенерировать SQL после изменения src/auth/index.ts
  npx @better-auth/cli migrate -y    # применить к БД
  ```
- **Собственные таблицы сервиса** (`grants`, `clients`, `service_grants`, PAT, `installed_apps`, `grant_requests` — появятся в следующих фазах) — через Kysely `Migrator`, файлы в `src/db/migrations/`:
  ```bash
  pnpm db:migrate
  ```

Не смешивать: Better-Auth CLI не знает про `src/db/migrations/`, наш `Migrator` не трогает таблицы Better-Auth.
