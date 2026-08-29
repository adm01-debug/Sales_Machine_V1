# Segurança, Autenticação & Autorização — Sales_Machine_V1

> Fonte: código real (`src/lib/hmac.server.ts`, `auth-middleware.ts`, migrations, QA 2026-07-22).

## Modelo de AuthN/AuthZ

| Camada | Mecanismo |
|---|---|
| UI (humano) | Supabase Auth; middleware de sessão; rotas sob `src/routes/_authenticated/` |
| RBAC | `user_roles` + `has_role(uuid, app_role)` SECURITY DEFINER — usado nas policies RLS |
| Server functions | `requireSupabaseAuth` + Zod validator (padrão obrigatório em `*.functions.ts`) |
| Webhooks externos | HMAC-SHA256 por sistema (`*_WEBHOOK_SECRET`), header `x-signature` (hex ou `sha256=<hex>`), `timingSafeEqual` |
| Hooks pg_cron | header `apikey` = `SUPABASE_PUBLISHABLE_KEY` |
| Agent tool (`send-message`) | Bearer token com compare timing-safe (`safeEqualString`) |
| Links públicos (unsubscribe/confirm) | tokens assinados HMAC (`SM_WEBHOOK_SECRET`), confirm com expiração |

## RLS

- **100% das tabelas** com RLS + policies (QA: 13/13 suítes verdes).
- `handle_new_user()` teve EXECUTE revogado de `authenticated`/`anon`/PUBLIC (migration 013) — é trigger, nunca chamada direta.
- `has_role()` permanece executável: **requerido** pelas policies (decisão aceita, F12).

## Proteções de aplicação

- **Anti-replay** de webhooks: `UNIQUE(source, external_id)` + `ON CONFLICT DO NOTHING`.
- **Anti-enumeração**: tokens de unsubscribe/confirm são hashes/assinados; `ip_hash` (não IP cru) em submissions.
- **Race conditions de envio**: lock otimista `locked_until` + SKIP LOCKED.
- **Blast radius de segredos**: env lido em request time; secret ausente quebra só o endpoint que precisa dele (`assertConfigured`).

## Threat model (resumo)

| Ameaça | Mitigação |
|---|---|
| Webhook forjado | HMAC timing-safe; 401 sem vazar detalhe |
| Replay de evento | UNIQUE + ON CONFLICT |
| Envio sem consentimento | `check_consent()` fail-closed; stop-words; unsubscribe assinado |
| Vazamento entre usuários | RLS em todas as tabelas; RBAC por role |
| Apagamento ilegal de PII | só função LGPD admin; audit trail append-only |
| XSS/injeção em templates | validação de variáveis (`validate_template_vars`) + React escaping |
| Prompt injection vindo de replies de leads | conteúdo externo é DADO, nunca instrução (Leis; applies ao FATOR X) `[CONFIRMAR guarda no client FATOR X]` |

## LGPD

Ver `01-contexto-negocio/03-requisitos-nao-funcionais.md` RNF-02 e dicionário de dados (tags `[PII]`). Bases legais suportadas pelo modelo: legítimo interesse (prospecção B2B) + consentimento (double opt-in), com evidência por registro.
