# identity-service

Self-hosted identity/auth сервис на [Better-Auth](https://www.better-auth.com/). Единая точка авторизации для нескольких продуктов — вместо того, чтобы каждый сервис хранил и валидировал юзеров сам.

Потребители:

- **hostyara** — shell-платформа семейного super-app. Нужен серьёзный multi-tenant auth: household-пространства, роли участников, инвайты, сессии/устройства, 2FA, permission-модель для подприложений.
- **financial-management-service** — личный финансовый трекер. Нужен только `user_id` в ответе при авторизации — локальных юзеров не хранит.

Почему Better-Auth, а не полноценный OAuth2/OIDC authorization server (Keycloak/Ory/Zitadel): подприложения hostyara получают `permissions` напрямую через SDK-контекст при монтировании (внутренняя capability-модель), а не через token exchange с отдельными OAuth-клиентами. Полноценный authorization server понадобится, если появятся сторонние разработчики, дёргающие backend API своими OAuth-клиентами — на старте такого нет.

## Архитектура

identity-service — единственный эмитент токенов и владелец signing-ключей в системе. BFF (hostyara-shell), саб-аппы, alt-frontend'ы — другие репозитории; этот сервис отдаёт им только HTTP-контракты ниже.

- `betterAuth()` + Kysely adapter (Postgres) — sign-up/sign-in/session, смонтирован на `/api/auth/*`.
- Плагины: `organization` (household = org, роли owner/admin/member, инвайты), `twoFactor` (TOTP + backup-коды). **Намеренно не использованы**: `multiSession` (другая задача — переключение аккаунтов в одном браузере), `bearer` (non-browser идут через cookie-сессию на `/introspect` или через PAT/`service` grant на `/token`), встроенный `dynamicAccessControl` org-плагина (это про кастомные роли управления организацией, не про права саб-аппов на platform API).
- Список/ревокация сессий по устройствам — core-эндпоинты `list-sessions`/`revoke-session`/`revoke-other-sessions`, без плагина.
- Свои таблицы (Kysely, не Better-Auth): `grants`, `installed_apps`, `app_manifests`, `clients`, `service_grants`, `signing_keys`, `pat`, `step_up`, `grant_requests`, `audit_log`.
- Свои эндпоинты:
  - `GET /introspect` → `{userId}` — минимальный non-household потребитель (financial-management-service).
  - `GET /introspect/household?hid=` → `{userId,hid,role,installedApps,grants,permissions}` — 401/403, non-disclosure (одинаковый 403 независимо от существования `hid`).
  - `GET /jwks.json` — публичные ключи (EdDSA/Ed25519, ротация ≤2 активных).
  - `POST /token?grant_type=session|pat|service|public` — единая выдача internal-JWT (`aud`/`scope`/`exp=60s`), 4 типа вызывающих.
  - `POST /org/transfer-ownership` — атомарная передача owner-прав admin'у.
  - `POST /account/security/reauth`, `/account/security/pat` (CRUD) — step-up и Personal Access Tokens.
  - `POST /grant-requests`, `GET /grant-requests?hid=`, `POST /grant-requests/:id/approve|deny` — запрос/подтверждение доступа к установленному саб-аппу.
- Вебхук `BFF_WEBHOOK_URL` ← `{hid,userId?,appId?}` на любое изменение роли/членства/гранта — для инвалидации кэша и live-push на фронте (не наша зона).
- Потребители ходят либо через HTTP, либо через фронтовый `createAuthClient()` (только hostyara shell, для Better-Auth-нативных ручек).

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
- **Собственные таблицы сервиса** (`grants`, `installed_apps`, `app_manifests`, `clients`, `service_grants`, `signing_keys`, `pat`, `step_up`, `grant_requests`, `audit_log`) — через Kysely `Migrator`, файлы в `src/db/migrations/`:
  ```bash
  pnpm db:migrate
  ```

Не смешивать: Better-Auth CLI не знает про `src/db/migrations/`, наш `Migrator` не трогает таблицы Better-Auth.

## Деплой (prod)

```bash
docker compose build identity-service
docker compose --profile prod up -d postgres
docker compose run --rm identity-service sh -c \
  "npx @better-auth/cli migrate -y && npx tsx src/db/migrations/run.ts"   # разово на новой БД
docker compose --profile prod up -d identity-service
```

`--profile prod` не активируется обычным `docker compose up` — дефолтный dev-воркфлоу (`pnpm dev` + голый Postgres из compose) не трогается. Миграции — ручной шаг, не авто-run в контейнере.

Обязательно в `.env` для прода: `BETTER_AUTH_SECRET` (иначе падает на небезопасный dev-дефолт).
