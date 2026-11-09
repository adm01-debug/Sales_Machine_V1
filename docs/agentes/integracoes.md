# Integrações externas e variáveis de ambiente — referência para agentes

Ler quando mexer em webhook, client externo, token ou variável de ambiente.

## Os quatro sistemas do funil

| Sistema | Papel | Client | Variáveis |
|---|---|---|---|
| **LUX** | descoberta de ICP/leads (entrada do funil) | `src/integrations/external/lux.server.ts` (`luxClient` L23) | `LUX_URL`, `LUX_SERVICE_KEY`, `LUX_WEBHOOK_SECRET` |
| **SINGU** | canal executor + CRM (quem envia de fato) | `singu.server.ts` (`singuClient` L26) | `SINGU_URL`, `SINGU_SERVICE_KEY`, `SINGU_WEBHOOK_SECRET` |
| **FATOR X** | geração de mensagem por IA | `fatorx.server.ts` (`fatorxClient` L23) | `FATORX_URL`, `FATORX_SERVICE_KEY`, `FATORX_WEBHOOK_SECRET`, `FATORX_AGENT_ID_DEFAULT` |
| **FUXICO** | tracking (open/click) | `fuxico.server.ts` (`fuxicoClient` L31, `isConfigured()` L33) | `FUXICO_URL`, `FUXICO_SERVICE_KEY`, `FUXICO_WEBHOOK_SECRET` |

Config central: `src/integrations/external/config.server.ts:9-37` (`getExternalConfig()`), com
`assertConfigured` (L39-45) que valida **apenas a `baseUrl`**, não as chaves — client "configurado"
não significa chave presente.

**Todas as variáveis são lidas em request time, dentro de função/handler — nenhuma em module scope.**
Isso é regra, não acidente (cabeçalho do `config.server.ts:1-6`): ler em module scope quebra o build e
o SSR. O client de service role é um Proxy lazy (`src/integrations/supabase/client.server.ts:64-69`),
instanciado no primeiro acesso.

## Variáveis de ambiente

25 nomes lidos via `process.env` em `src/`:

```
AGENT_TOOL_TOKEN · FATORX_AGENT_ID_DEFAULT · FATORX_SERVICE_KEY · FATORX_URL ·
FATORX_WEBHOOK_SECRET · FUXICO_SERVICE_KEY · FUXICO_URL · FUXICO_WEBHOOK_SECRET ·
LUX_SERVICE_KEY · LUX_URL · LUX_WEBHOOK_SECRET · OPS_ALERT_WEBHOOK_SECRET ·
OPS_ALERT_WEBHOOK_URL · PHANTOMBUSTER_API_KEY · PUBLIC_SITE_URL · SINGU_SERVICE_KEY ·
SINGU_URL · SINGU_WEBHOOK_SECRET · SM_WEBHOOK_SECRET · SUPABASE_ANON_KEY ·
SUPABASE_PUBLISHABLE_KEY · SUPABASE_SERVICE_ROLE_KEY · SUPABASE_URL · UNIPILE_API_KEY · UNIPILE_URL
```

No browser: `import.meta.env.VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
(`src/integrations/supabase/client.ts:33-34`) — tudo com prefixo `VITE_` **vai para o bundle e é
público**; nunca ponha segredo atrás de `VITE_`.

**O `.env` do repo tem 6 linhas**, todas com dados públicos do Supabase — mas só 2 batem com a
lista de 25 acima (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`); as outras 4 são os três `VITE_*`
(lidos por `import.meta.env`, mecanismo diferente — `client.ts:33-34`) e `SUPABASE_PROJECT_ID`,
que **não é referenciada em `src/` por nenhum dos dois mecanismos** (`grep -rn SUPABASE_PROJECT_ID src/`
= vazio). Ele está
**versionado no git** (`git ls-files .env` devolve `.env`) e **não** está no `.gitignore` — hoje sem
segredo dentro, mas é uma armadilha: qualquer chave de servidor escrita ali vai para o repositório.
Nunca adicione `SUPABASE_SERVICE_ROLE_KEY`, `*_SERVICE_KEY`, `*_WEBHOOK_SECRET`, `SM_WEBHOOK_SECRET` ou
`AGENT_TOOL_TOKEN` ao `.env`; essas vivem no ambiente de execução. Não há `.env.example` (pendência aberta).

Faltando qualquer `*_URL`, o client correspondente simplesmente não chama o sistema externo — o fluxo
degrada em silêncio. Ao diagnosticar "não enviou", confira presença de variável antes de culpar o código.

## Webhooks de entrada — todos verificam HMAC

Helper único: `src/lib/hmac.server.ts:7-25` — `verifyHmac()` com `createHmac("sha256")` (L16),
comparação de comprimento (L19) e `timingSafeEqual` (L21); aceita `sha256=<hex>` ou hex puro (L13-15).
`signPayload()` L28-29, `safeEqualString()` L33-37.

| Rota (em `src/routes/api/public/`) | Header | Verificação | Segredo |
|---|---|---|---|
| `webhooks/lux.ts` | `x-signature` | L23 → 401 L24 | `LUX_WEBHOOK_SECRET` (L20) |
| `webhooks/singu.ts` | `x-signature` | L20 → 401 L21 | L17 |
| `webhooks/singu-bounce.ts` | `x-signature` | L21 → 401 L22 | L19 |
| `webhooks/fatorx.ts` | `x-signature` | L19 → 401 L20 | L16 |
| `webhooks/fuxico.ts` | `x-webhook-signature` **ou** `x-signature` | L66-67 → 401 | L63 |

Todos verificam **antes** de parsear o body (leem o texto cru). Endpoint público novo sem HMAC (ou sem
bearer timing-safe) não entra: é a Lei 5.

## Hooks internos (pg_cron) — autenticação fraca por design atual

`tick-cadence.ts:32-37`, `tick-journeys.ts:30-36`, `tick-marketing.ts:27-33`, `alert-sweep.ts:23-28`,
`budget-reallocate.ts:19-24` usam o mesmo gate: header `apikey` comparado com
`SUPABASE_PUBLISHABLE_KEY ?? SUPABASE_ANON_KEY` por `!==` **simples (não constant-time)**.

Duas consequências: o "segredo" é a publishable key, que é **pública** (vai no bundle do front,
`client.ts:34`, e está em claro nas migrations de cron); e a comparação não é timing-safe. Depois do
gate, esses hooks usam `supabaseAdmin` (service role, bypassa RLS). Quem endurecer isso precisa trocar
o header nos três `cron.schedule` no mesmo ciclo (migration nova) — ver `docs/agentes/banco.md`.

`agent-tools/send-message.ts:26-31` é o único que usa bearer com `safeEqualString` (constant-time) —
mas não verifica consentimento (ver `docs/agentes/regras-dominio.md`).

## Alertas de saída

`alert-sweep.ts:167-174` faz POST em `OPS_ALERT_WEBHOOK_URL` com payload assinado
(`signPayload`, segredo `OPS_ALERT_WEBHOOK_SECRET`). `deliverability.functions.ts:246` assina chamadas
para o FUXICO. Mantenha o padrão: saída para fora assina o corpo.

## Canais sociais: stub

`src/integrations/social/types.ts` é o único arquivo do módulo. Adapter com três implementações:
`StubSocialSender` (L26-31, devolve `{status:"pending_provider"}`, é o **default**), `UnipileSender`
(L33-63, implementado de fato: `POST {UNIPILE_URL}/api/v1/messages`, header `X-API-KEY`) e
`PhantombusterSender` (L65-72, esqueleto que também devolve `pending_provider`). A fábrica
`getSocialSender()` (L75-83) escolhe por variável de ambiente.

Como `UNIPILE_URL`/`UNIPILE_API_KEY`/`PHANTOMBUSTER_API_KEY` não estão configuradas, **LinkedIn e
Instagram são no-op hoje**. Não documente nem prometa envio social como funcionando.

## Lovable auth

`src/integrations/lovable/index.ts` (38 linhas, auto-gerado): OAuth google/apple/microsoft/lovable via
`@lovable.dev/cloud-auth-js`, com `supabase.auth.setSession` (L31). Não editar à mão.
