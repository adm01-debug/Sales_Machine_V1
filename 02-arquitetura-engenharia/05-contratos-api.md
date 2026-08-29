# Contratos de API — Sales_Machine_V1

> Fonte: handlers reais em `src/routes/api/`. Webhooks verificados arquivo a arquivo; padrões comuns marcados. Rotas de páginas (UI) não entram aqui.

## Convenções

- **Webhooks externos:** `POST`, HMAC-SHA256 do **raw body** no header `x-signature` (hex ou `sha256=<hex>`); 401 em assinatura inválida; 400 em payload inválido (Zod); 500 com log interno em erro de ingestão. Nunca vazam detalhes internos na resposta.
- **Hooks internos (pg_cron):** `POST` com header `apikey` = publishable key; resposta JSON `{ok, ...contadores}`.
- **Tracking/unsubscribe:** GET público com token assinado.

## Webhooks (ingestão)

### `POST /api/public/webhooks/lux` ✅ verificado no código
Eventos do LUX (descoberta ICP).
```jsonc
// body
{ "event_type": "icp_company_found", "external_id": "lux_123", "payload": { /* livre */ } }
// 200 → { "ok": true, "event_id": "<uuid>" }   · grava sales_machine_events (source='lux')
```

### `POST /api/public/webhooks/singu`
Eventos do executor (reply, status de envio). Detecta **stop-words** de opt-out (`detectStopWord`) e grava `consent_ledger` imediatamente.

### `POST /api/public/webhooks/singu-bounce`
Bounces/complaints de email → `email_deliverability_events` (afeta `compute_daily_cap`).

### `POST /api/public/webhooks/fatorx`
Decisões/callbacks do agente IA (schema Zod próprio).

### `POST /api/public/webhooks/fuxico`
Eventos de tracking (open/click) → atualiza touchpoints via `fuxico_tracking_id` `[CONFIRMAR campos exatos]`.

## Hooks internos (pg_cron → `apikey`)

| Endpoint | Schedule | Função |
|---|---|---|
| `POST /api/public/hooks/tick-cadence` | `* * * * *` | Worker 1:1: batch 10 targets, lock 5min, consent/cooldown/budget gates, despacha ou agenda retry. Resposta: `{ok, processed, skipped_cooldown, dead_lettered, queued_approval, blocked_consent, blocked_budget}` ✅ |
| `POST /api/public/hooks/tick-journeys` | `* * * * *` | Avança enrollments de journeys |
| `POST /api/public/hooks/tick-marketing` | `*/5 * * * *` | Broadcast 1:many |
| `POST /api/public/hooks/alert-sweep` | `*/15 * * * *` | Avalia regras de alerta → `ops_alert_notifications` (+ webhook externo opcional), com cooldown anti-reenvio |
| `POST /api/public/hooks/budget-reallocate` | sob demanda | Realocação automática de budget entre canais |

## Públicos utilitários

| Endpoint | Função |
|---|---|
| `GET /api/public/track/open.gif` | Pixel de abertura (email tracking) |
| `GET /api/public/track/click` | Redirect de clique rastreado |
| `GET /api/public/unsubscribe` | Descadastro 1-clique com token assinado (`SM_WEBHOOK_SECRET`) |
| `POST /api/public/agent-tools/send-message` | Envio manual via agente; Bearer timing-safe |

## Server functions (UI ↔ servidor)

`src/lib/*.functions.ts` — chamadas via TanStack Start server fns (não HTTP público). Padrão obrigatório: `requireSupabaseAuth` + Zod. Domínios: orchestrator, journeys, audiences, templates, lead-forms, compliance, deliverability, ops, budget, analytics, churn, profile360, preflight-history.

> OpenAPI formal: a gerar quando houver consumidor externo (hoje os únicos consumidores são os 5 sistemas do funil + pg_cron, contratos acima). `[CONFIRMAR necessidade]`
