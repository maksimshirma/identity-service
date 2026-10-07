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
- Свои эндпоинты — полный список с методами/авторизацией в разделе [«Доступные URL»](#доступные-url) ниже.
- Вебхук `BFF_WEBHOOK_URL` ← `{hid,userId?,appId?}` на любое изменение роли/членства/гранта — для инвалидации кэша и live-push на фронте (не наша зона).
- Потребители ходят либо через HTTP, либо через фронтовый `createAuthClient()` (только hostyara shell, для Better-Auth-нативных ручек).

### Подключение hostyara BFF

BFF (`hostyara/apps/bff`) ходит сюда server-to-server от имени браузера, поэтому:

- миграция `0012_seed_hostyara_bff_client` регистрирует его в `clients` как `('hostyara-bff', 'bff')` — нужно для `public`-grant на `/token`; `BFF_CLIENT_ID` у BFF должен совпадать;
- BFF шлёт `Origin` = своему `BFF_PUBLIC_URL`, а Better-Auth проверяет Origin у POST-запросов с кукой — этот origin должен быть в `TRUSTED_ORIGINS` (через запятую), иначе `403 INVALID_ORIGIN`;
- `BFF_WEBHOOK_URL` указывает на внутренний listener BFF: `http://localhost:4001/webhooks/access-changed`.

Локально host занимает `:3000`, поэтому вместе с hostyara этот сервис запускается на `:3001`:

```bash
PORT=3001 TRUSTED_ORIGINS=http://localhost:3000 BFF_WEBHOOK_URL=http://localhost:4001/webhooks/access-changed pnpm dev
```

Проверка Origin включена и в тестах (`advanced.disableOriginCheck: false`): по умолчанию Better-Auth выключает её при `NODE_ENV=test`.

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

### Первый раз (после клонирования)

```bash
pnpm install
cp .env.example .env          # дефолты уже рабочие для локали

docker compose up -d          # поднять Postgres
docker compose ps             # дождаться "healthy" — на холодный старт пару секунд

npx @better-auth/cli migrate -y   # схема Better-Auth (user/session/account/...)
pnpm db:migrate                   # свои таблицы (grants/clients/signing_keys/...)

pnpm dev
```

`dev` поднимет сервер на `http://localhost:3000` (`GET /health` должен ответить `{"status":"ok"}`). Оба шага миграций — once per fresh БД (новый volume/новая `.env` с другим `POSTGRES_DB`); при обычной работе база уже накатана, их заново гонять не нужно.

### День за днём

```bash
docker compose up -d   # если Postgres ещё не запущен — см. docker compose ps
pnpm dev                # tsx watch src/main.ts, автоперезапуск на сохранении
```

Остановить Postgres, когда не нужен: `docker compose down` (без `-v` — volume с данными остаётся).

### Прочие команды

```bash
pnpm build          # tsc -> dist/
pnpm start          # node dist/main.js (прод-сборка, без watch)
pnpm check:types    # tsc --noEmit
pnpm test           # e2e, см. раздел «Тесты» ниже
```

### Частые ошибки при `pnpm dev`

- **`AggregateError [ECONNREFUSED]` / `connect ECONNREFUSED 127.0.0.1:5433`** — Postgres не запущен или ещё не принимает подключения. Поднять: `docker compose up -d`, затем `docker compose ps` — статус должен быть `healthy`, не просто `running` (healthcheck идёт ~5-15с после старта контейнера). Порт `5433` — см. `POSTGRES_PORT` в `.env`/`.env.example`, выбран специально не-дефолтным, чтобы не конфликтовать с другим локальным Postgres на `5432`.
- **`error: relation "signing_keys" does not exist`** (или `"user"`, `"grants"` и т.п.) — Postgres поднят, но миграции не накатаны (свежий volume/свежая БД). Прогнать оба шага миграций из раздела «Первый раз» выше, затем `pnpm dev` снова.
- **`Database schema mismatch` (warning в логах Better-Auth)** — то же самое, но конкретно про таблицы Better-Auth: `npx @better-auth/cli migrate -y`.

## Доступные URL

После `pnpm dev` сервис слушает `http://localhost:3000`.

### Посмотреть глазами (браузер)

| URL | Что это |
|---|---|
| `GET /docs` | Swagger UI — все 72 пути (свои + Better-Auth) из `/openapi.json`, можно жать «Try it out» |
| `GET /api/auth/reference` | Scalar — альтернативная авто-документация, только Better-Auth-ручки (sign-in/up, organization/*, two-factor/*), с готовыми примерами |
| `GET /openapi.json` | сырая OpenAPI 3.0 схема, которую рендерят оба UI выше |

### Авторизация в Swagger UI (`/docs`)

Большинство ручек сидят на cookie-сессии, не на Bearer-токене — зелёная кнопка **Authorize** сверху справа для них **не работает** (там висит `apiKeyCookie` с именем куки `apiKeyCookie` — это placeholder из автогенерации Better-Auth, настоящая кука называется иначе, руками его не исправить). Авторизация делается иначе:

1. Открой `POST /api/auth/sign-up/email` (первый раз) или `/api/auth/sign-in/email`, **Try it out**, впиши `email`/`password`, **Execute**.
2. Браузер сам сохранит cookie-сессию из ответа (в панели ответа Swagger её не покажет — `Set-Cookie` браузеры скрывают от JS из соображений безопасности, но куку он реально поставил).
3. Всё — следующие **Try it out** на любой ручке (свои `/introspect*`, `/token`, `/grant-requests*`, `/account/security/*`, или Better-Auth `/api/auth/organization/*`) пойдут уже с этой сессией, потому что `/docs` и API — один домен, браузер шлёт куку сам. Повторной авторизации не нужно, пока сессия жива (7 дней) или пока не нажмёшь `/api/auth/sign-out`.

Для PAT-эндпоинтов (`/token?grant_type=pat`, требует `Authorization: Bearer <token>`) — вот тут **Authorize** реально нужен:

1. Сначала авторизуйся cookie-сессией (шаги выше), затем `POST /account/security/pat` → Execute → скопируй `token` из ответа (виден только один раз).
2. Нажми **Authorize**, в поле `bearerAuth` вставь этот токен, **Authorize**, закрой диалог.
3. Теперь `Authorization: Bearer ...` прилетает автоматически на все ручки с этой схемой.

Для `service`/`public` grant_type в `/token` авторизация не нужна вообще — `clientId`/`secret` передаются прямо в теле запроса.

### Свои ручки

| Method | Path | Auth | Что делает |
|---|---|---|---|
| `GET` | `/health` | — | живость + пинг БД, `{"status":"ok"}` |
| `GET` | `/introspect` | cookie-сессия | `{userId}` — минимум для non-household потребителей (financial-management-service) |
| `GET` | `/introspect/household?hid=` | cookie-сессия | `{userId,hid,role,installedApps,grants,permissions}`; `401` не авторизован, `403` не член (тело одинаковое для несуществующего и существующего `hid`) |
| `GET` | `/jwks.json` | — (публичный) | JWK Set для проверки `internal-JWT` из `/token` |
| `POST` | `/token?grant_type=session\|pat\|service\|public` | зависит от типа (cookie / `Authorization: Bearer <PAT>` / `clientId`+`secret` в body / только `clientId`) | выдаёт `internal-JWT` (`aud`/`scope`/`exp=60s`) |
| `POST` | `/org/transfer-ownership` | cookie-сессия (owner) + **step-up** | атомарная передача owner → admin |
| `POST` | `/account/security/reauth` | cookie-сессия | пароль (+TOTP если включена 2FA) → помечает текущую сессию «свежей» на 5 мин для step-up-действий |
| `POST` | `/account/security/pat` | cookie-сессия | создать Personal Access Token (сырой токен показывается один раз в ответе) |
| `GET` | `/account/security/pat` | cookie-сессия | список своих PAT (без сырых токенов) |
| `DELETE` | `/account/security/pat/:id` | cookie-сессия | мгновенная ревокация PAT |
| `POST` | `/grant-requests` | cookie-сессия (член household) | запросить доступ к установленному саб-аппу |
| `GET` | `/grant-requests?hid=` | cookie-сессия (owner/admin) | список запросов на доступ в household |
| `POST` | `/grant-requests/:id/approve` | cookie-сессия (owner/admin) | подтвердить запрос → создаёт/обновляет `grants` |
| `POST` | `/grant-requests/:id/deny` | cookie-сессия (owner/admin) | отклонить запрос |

### Better-Auth (`/api/auth/*`)

Смонтированы целиком под префиксом, самые частые для ручного curl/Postman:

| Method | Path | Что делает |
|---|---|---|
| `POST` | `/api/auth/sign-up/email` | регистрация, сразу отдаёт cookie-сессию |
| `POST` | `/api/auth/sign-in/email` | логин; если включена 2FA — `{twoFactorRedirect:true}` вместо сессии |
| `GET` | `/api/auth/get-session` | текущая сессия/юзер по cookie, `null` если нет/невалидна |
| `POST` | `/api/auth/sign-out` | завершить текущую сессию |
| `GET` | `/api/auth/list-sessions` | все активные сессии юзера (по всем устройствам) |
| `POST` | `/api/auth/revoke-session` | ревокнуть сессию по `token` — мгновенно |
| `POST` | `/api/auth/organization/create` | создать household, caller → `owner` |
| `POST` | `/api/auth/organization/invite-member` | пригласить участника по email+role |
| `POST` | `/api/auth/organization/accept-invitation` | принять инвайт |
| `POST` | `/api/auth/organization/remove-member` | убрать участника — требует **step-up** |
| `POST` | `/api/auth/organization/update-member-role` | сменить роль — **step-up** только при повышении до `admin`/`owner` |
| `POST` | `/api/auth/organization/leave` | выйти — заблокировано для единственного `owner` |
| `POST` | `/api/auth/two-factor/enable` | включить 2FA, отдаёт `totpURI`+backup-коды |
| `POST` | `/api/auth/two-factor/verify-totp` | подтвердить код — и при энролле, и при gated-логине |
| `POST` | `/api/auth/request-password-reset` | письмо со ссылкой сброса (сейчас — `console.log`-стаб, см. `src/auth/mail.ts`) |
| `POST` | `/api/auth/reset-password` | сброс пароля по токену из письма |

Полный список (все 60 better-auth-путей + схемы запросов/ответов) — в `/docs` или `/api/auth/reference`, руками никто это не поддерживает.

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

## Тесты

e2e, против настоящего Postgres (не моки) — то же, что принято в financial-management-service. Тесты бьют прямо в `Hono`-приложение (`app.request(...)`, встроенный способ Hono), не через сеть, `supertest` не используется.

```bash
docker compose up -d   # тот же dev-Postgres
pnpm test               # pretest подготавливает identity_service_test, затем jest
```

`pretest` (`src/test/setup-test-db.ts`) каждый раз пересоздаёт `${POSTGRES_DB}_test` с нуля — накатывает `better-auth_migrations/*.sql` напрямую и свои миграции через тот же Kysely `Migrator`. Между тестами — `truncateAllTables()` (не транзакции).

Тесты лежат в `__jest__/` рядом с проверяемым кодом (`src/routes/__jest__/token.test.ts` и т.п.).

## Деплой (prod)

```bash
docker compose build identity-service
docker compose --profile prod up -d postgres
docker compose run --rm identity-service sh -c \
  "npx @better-auth/cli migrate -y && npx tsx src/db/migrations/run.ts"   # разово на новой БД
docker compose --profile prod up -d identity-service
```

`--profile prod` не активируется обычным `docker compose up` — дефолтный dev-воркфлоу (`pnpm dev` + голый Postgres из compose) не трогается. Миграции — ручной шаг, не авто-run в контейнере.

Обязательно в `.env` для прода: `BETTER_AUTH_SECRET` (иначе падает на небезопасный dev-дефолт). С hostyara BFF — также `TRUSTED_ORIGINS` (публичный origin shell) и `BFF_WEBHOOK_URL` (внутренний адрес BFF).
