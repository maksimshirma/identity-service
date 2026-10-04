# identity-service

Self-hosted identity/auth сервис на [Better-Auth](https://www.better-auth.com/).

## Контекст

Отдельный сервис вместо хранения юзеров внутри каждого продукта. Потребители:

- **hostyara** — серьёзный multi-tenant auth: household-пространства, роли участников, инвайты, сессии/устройства, 2FA. См. `informational-architecture.md` в репе hostyara.
- **financial-management-service** — нужен только `user_id` в ответе при авторизации (локальная таблица `users` там уже удалена, FK на неё снят).

Better-Auth выбран вместо полноценного OAuth2/OIDC authorization server (Keycloak/Ory/Zitadel), потому что sub-apps в hostyara получают `permissions` напрямую через SDK-контекст при монтировании (внутренняя capability-модель), а не через token exchange с отдельными OAuth-клиентами. Если позже появятся настоящие сторонние разработчики, дёргающие backend API своими OAuth-клиентами — тему пересмотреть.

## Фазы

### Phase 0 — Setup

Новый pnpm/TS проект. HTTP framework — Hono (`@hono/node-server`), уже выбран. Postgres + Kysely adapter для Better-Auth.
**Готово:** пустой сервер поднимается, Better-Auth инстанс создан с Kysely adapter, коннект к Postgres работает.

### Phase 1 — Core auth

Email/password login, cookie session. `better-auth generate`/`migrate` под Postgres. Проверить, что сгенерированная схема Better-Auth (`user`, `session`, `account`, `verification`) не конфликтует с существующим подходом к ручным SQL-миграциям в других сервисах.
**Готово:** регистрация + логин + сессия работают end-to-end через HTTP.

### Phase 2 — Organization plugin

Household-модель: orgs, роли (owner/admin/member), участники, invite-flow (соответствует `/invite/:token` из hostyara IA).
**Готово:** можно создать org, пригласить участника, участник принимает инвайт и видит свою роль.

### Phase 3 — Session & security plugins

Список активных устройств/сессий (`/account/sessions` в hostyara) — через core `list-sessions`/`revoke-session`/`revoke-other-sessions`, без плагина (`multiSession`-плагин для другого — переключения между аккаунтами в одном браузере). `twoFactor` (`/account/security`).
**Готово:** юзер видит список своих сессий и может их завершить; 2FA включается и проверяется при логине.

### Phase 4 — Non-browser consumers

`bearer` plugin или server-side `auth.api.*` для MCP-серверов и backend-сервисов без cookie (браузер не нужен). Зафиксировать контракт ответа при авторизации: какие поля отдаются (`user_id`, org/household id, роли).
**Готово:** MCP-сервер (financial-management-service) может верифицировать токен и получить `user_id` без HTTP cookie flow.

### Phase 5 — Dynamic Access Control

Смэппить permission-строки из манифеста hostyara (`household.members.read`, `storage.own`, `notifications.send`, ...) на access control Better-Auth (Dynamic Access Control в organization plugin).
**Готово:** sub-app манифест с `permissions: [...]` транслируется в реальные access control rules, проверяемые на сервере.

### Phase 6 — Integration

Подключить financial-management-service (заменить текущую авторизационную заглушку на реальные вызовы identity-service) и hostyara shell (login/signup/account/spaces экраны из IA).
**Готово:** оба потребителя получают юзера через identity-service, локальных заглушек не осталось.

### Phase 7 — Hardening

Rate limiting на login, email verification, password reset, audit log, docker-compose деплой, observability (логи/метрики).
**Готово:** сервис готов к продакшену — защищён от брутфорса, есть восстановление доступа, задеплоен через docker-compose.

## Темы для изучения (предварительно)

- Better-Auth core config + Kysely adapter
- Organization plugin + Dynamic Access Control
- multiSession, twoFactor plugins
- bearer plugin / server-side `auth.api.*` для non-browser клиентов
- Кастомная OAuth-redirect схема (`hostyara://`) — если понадобится social login
- CORS / multi-origin, если sub-apps hostyara не в одном JS-рантайме
- anonymous plugin — возможно для публичного шаринга в hostyara (`/s/:token`)
