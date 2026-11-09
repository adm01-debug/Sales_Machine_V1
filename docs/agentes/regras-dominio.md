# Consentimento, LGPD e regras de domínio — referência para agentes

Ler **antes** de tocar em qualquer caminho que envie mensagem, mude estado de target, grave
consentimento ou leia dado pessoal. Este sistema manda mensagem real para pessoa real: erro aqui é
spam, bloqueio de sender e violação de LGPD.

## O gate de consentimento — como é de verdade

`check_consent(_entity_id, _channel)` é a função vigente (`supabase/migrations/20260722200434_….sql:1`,
SECURITY INVOKER). Semântica: `COALESCE(..., TRUE)` (L8-14) → **sem registro no `consent_ledger`, o
envio é permitido**. Quem bloqueia é um `opt_out` explícito. Os motores puros repetem a mesma regra
(`src/lib/cadence-engine.ts:121`, `journey-engine.ts:335`, `journey-triggers.ts:112`,
`audience-resolver.server.ts:59`).

Estado real dos quatro caminhos de envio:

| Caminho | Chama `check_consent`? | Em erro do RPC |
|---|---|---|
| `src/routes/api/public/hooks/tick-cadence.ts:119` | ✅ antes de qualquer despacho | **fail-closed**: adia 15 min, volta a `queued`, grava `last_error` (L125-137) |
| `src/routes/api/public/hooks/tick-journeys.ts:212` | ✅ | **fail-closed**: `waiting` + 15 min (L221-229) |
| `src/routes/api/public/hooks/tick-marketing.ts:137` | ✅ | **fail-closed** desde 2026-11-08: adia 15 min, volta a `queued`, grava `last_error` (L141-150) |
| `src/routes/api/public/agent-tools/send-message.ts:63` | ✅ desde 2026-11-08 | **fail-closed**: 503 sem despachar, nem para canal stub (L67-77) |

Os dois furos que existiam (fail-open no marketing, ausência total no endpoint de agente) foram
fechados no mesmo ciclo da adoção deste padrão de docs — ver
`.contexto-compartilhado/pendencias-conhecidas.md` e `00-governanca/04-changelog-prompts.md`.
Reabrir qualquer um dos dois exige o mesmo nível de evidência que fechou (teste de regressão +
diff mínimo).

Proibido em qualquer hipótese: remover, afrouxar ou condicionar o gate; enviar mensagem real para lead
em teste; apagar dado pessoal com `DELETE` manual.

## Opt-out e stop words

Há **três listas**, e só duas são usadas:

1. **Código (a que vale)** — `src/lib/unsubscribe-token.server.ts:56`:
   `["pare","parar","sair","stop","cancelar","cancel","unsubscribe","descadastrar","remover"]`.
   `detectStopWord()` (L58-62) tokeniza e compara por **igualdade** (não substring). Consumida no
   webhook do SINGU (`src/routes/api/public/webhooks/singu.ts:4` e a partir da L40), que grava
   `opt_out` no `consent_ledger` **imediatamente**.
2. **Preflight de texto** — `src/lib/message-preflight.ts:47-49`: `OPTOUT_REQUIRED = ["sms","whatsapp"]`
   e um regex que **exige** menção de opt-out no corpo desses canais.
3. **Banco (não usada)** — `stop_word_lists`, criada numa migration base64 **não aplicada**; traz termos
   que o código não detecta (`CHEGA`, `0`, `NÃO QUERO`, `QUIT`, `END`, `REMOVE ME`, `CANCELAR INSCRIÇÃO`,
   `NÃO RECEBER`, `OPT OUT`). Grep por `stop_word_lists` em `src/` = 0.

Ou seja: hoje um "CHEGA" ou um "0" **não** é reconhecido como opt-out. Mudar a lista do código é mudar
`unsubscribe-token.server.ts` + os testes em `src/lib/security-tokens.test.ts:128-148`.

Link de descadastro: token `base64url(payload).hmac-sha256` com `timingSafeEqual`
(`unsubscribe-token.server.ts:26-41`), segredo `SM_WEBHOOK_SECRET` (cai para `AGENT_TOOL_TOKEN`, L21).
A rota `src/routes/api/public/unsubscribe.tsx:20-25` valida o token no GET e grava `opt_out` no POST.

## Disclosure de IA — a regra existe, a implementação não

A regra ("disclosure de IA na primeira mensagem do agente") está documentada no
`dicionario-dados.md` e vinha da tabela `agent_identity_config` (`disclosure_text NOT NULL`, persona,
guardrail de identidade), criada **apenas** na migration base64 `009`, que não é SQL válido.

Verificado em 2026-11-08: `grep -rn "disclosure\|agent_identity\|identity_config" src/` → **zero
ocorrências**. A tabela não está em `types.ts`. **Não existe disclosure de IA em nenhum caminho de
envio.** Trate como regra de negócio pendente, não como invariante do código: se escrever num doc que
o disclosure é aplicado, é afirmação falsa.

## Máquina de estados de `campaign_targets`

- Enum `sm_target_state`: `queued | running | paused | replied | stopped | lost | completed | dead_letter`.
- Transições são registradas por trigger em `campaign_target_events` (append-only):
  `tg_log_target_state_change()` (`20260720181807_….sql:54`) + `trg_campaign_targets_state_log` (L73);
  `tg_sync_target_status()` (L78) mantém a coluna `status` legada em sincronia.
- **Nunca** faça `UPDATE` direto em `campaign_targets.state` fora do fluxo do worker: você gera evento
  de transição inválido ou nenhum. A validação `tg_validate_target_state_transition()` existe só nas
  migrations base64 — ou seja, **não está no banco**: o trigger não vai te salvar.
- `locked_until` é o lock. O worker **não** usa `FOR UPDATE SKIP LOCKED` (a função que faz isso,
  `fn_claim_cadence_batch`, nunca é chamada por `src/`): ele faz lock otimista —
  `SELECT … .in("state",["queued","running"]).lte("next_run_at",now).or("locked_until.is.null,locked_until.lt.now").limit(10)`
  (`tick-cadence.ts:42-49`) e depois `UPDATE {locked_until: now+5min, state:"running"}` repetindo a
  cláusula `.or(...)`, seguindo só se o update devolveu linha (`tick-cadence.ts:72-80`). Mesmo padrão em
  `tick-journeys.ts:49,87-89`.
- Quem pega um target **sempre** solta `locked_until` ao terminar (há ~18 pontos de liberação em
  `tick-journeys.ts`; a recuperação de locks presos é `src/lib/ops-recovery.server.ts:47`).

## Ingestão idempotente

- `sales_machine_events` tem `UNIQUE(source, external_id)`: todo webhook grava com
  `ON CONFLICT DO NOTHING` — é a proteção de replay. Append-only.
- `entity_map` é a ponte de identidade LUX ↔ SINGU: upsert por `ON CONFLICT (kind, lux_id)` /
  `(kind, singu_id)` (índices em `20260720132748_….sql:69-70`). Nunca INSERT direto.

## Tracking é forjável

`track/click.ts` e `track/open[.]gif.ts` são GET públicos sem autenticação e o parâmetro `tp`
(touchpoint) **não é assinado**: qualquer um pode fabricar abertura e clique e isso entra em
`email_deliverability_events` e `sales_machine_events` via service role. O click valida apenas o
protocolo do destino (`click.ts:13-19`, anti open-redirect). Não construa métrica de negócio crítica
nem gatilho de journey sobre esses eventos sem antes assinar o `tp`.

## Compliance textual

`src/lib/compliance-terms.ts` (`NICHE_RULES`, 6 nichos, severidades `error|warning|info`) +
`compliance_terms` / `compliance_violations_log`. `message-preflight` e `email-preflight` rodam antes
do envio; termos proibidos por nicho são `error` e devem bloquear, não avisar.
