# Glossário de Domínio — Sales_Machine_V1

> Linguagem ubíqua. Cada termo tem UMA definição. Fontes: código real + benchmark + SCHEMA_REFERENCE. `[CONFIRMAR]` = inferência a validar com o dono.

## Sistemas externos (o funil)

| Termo | Definição |
|---|---|
| **LUX** | Sistema de descoberta de leads/ICP. Envia eventos via webhook (`POST /api/public/webhooks/lux`, HMAC). Entidades entram no funil por ele. |
| **SINGU** | Executor de canal e **CRM oficial**. Envia WhatsApp/SMS/email de fato; devolve eventos (reply, bounce) via webhooks `singu` e `singu-bounce`. |
| **FATOR X** | Serviço de IA que **gera a mensagem** de cada toque a partir dos sinais da entidade. Mantém thread de conversa por `fatorx_thread_id`. Avaliado por harness próprio (evals). |
| **PROMO CHAMPIONS** | Destino do **handoff**: quando um target vira deal quente (`state='replied'` qualificado), a oportunidade vai para este sistema. |
| **FUXICO** | Sistema de tracking (abertura de email, clique) `[CONFIRMAR escopo]`. Webhook próprio + `fuxico_tracking_id` nos touchpoints + `fuxico_id` na entity_map. |
| **OIE** | Projeto open-source de referência de padrões. **Licença não permite copiar código.** |
| **Unipile / Phantombuster** | Providers futuros para canais sociais (LinkedIn/Instagram), atrás do adapter `SocialSender` (hoje: stubs). |

## Entidades do domínio

| Termo | Definição |
|---|---|
| **entity / entity_map** | Chave canônica que une uma mesma empresa/contato nos 4+ sistemas (`lux_id`, `singu_id`, `fatorx_thread_id`, `fuxico_id`). `kind`: `company` ou `contact`. |
| **target** (`campaign_targets`) | Uma entity inscrita numa campanha 1:1, com `state` (máquina de estados), `current_step`, `next_run_at`, `locked_until`. |
| **touchpoint** (`contact_touchpoints`) | Um toque 1:1 concreto (um envio WhatsApp/email/SMS...) com status, tentativas e backoff. |
| **cadência** (`cadence_rules`) | Sequência de passos multicanal (steps) com intervalos; presets `aggressive/standard/enterprise/custom`. |
| **journey** | Automação visual 1:many: grafo de nós `trigger/send/wait/condition/split/goal/exit` com enrollments. |
| **audience** | Segmento de entities para broadcast, com `audience_members`. |
| **lead form** | Formulário público de captura (`/f/:slug`) com **double opt-in** (`confirmar?token=...`). |
| **signal** | Evento de comportamento com peso e meia-vida (`signal_weights`); compõe o `signal_score(entity)`. |

## Estados e máquinas

| Termo | Definição |
|---|---|
| **`sm_target_state`** | `queued → running → replied/stopped/lost/completed/dead_letter` (+`paused`). Transições só via trigger — nunca UPDATE direto. |
| **`sm_touchpoint_status`** | Ciclo de um envio: `queued/sent/delivered/read/replied/failed/opted_out/dead_letter/pending_approval/pending_provider`. |
| **dead_letter** | Destino de touchpoint/target após esgotar tentativas — exige revisão humana, nunca retry infinito. |
| **pending_approval** | Toque aguardando gate humano (`requires_human_approval` na campanha; tela `/approvals`). |

## Compliance & reputação

| Termo | Definição |
|---|---|
| **consent_ledger** | Registro append-only de consentimento/opt-out por entity+canal, com evidência. Base do `check_consent()`. |
| **stop words** | Palavras ("pare", "sair", "unsubscribe"...) detectadas no webhook SINGU → opt-out imediato. |
| **disclosure de IA** | Aviso obrigatório de que a mensagem foi gerada por IA, injetado na 1ª mensagem. |
| **compliance terms** | Termos proibidos/restritos por nicho regulado (saúde, financeiro, jurídico, apostas, suplementos) checados em preflight. |
| **sender warmup** | Ramp-up de volume de email: cap = 50/dia → +10/dia ativo, teto 500; bounce >5% congela em 50 (`compute_daily_cap`). |
| **anti-carpet-bombing** | Cooldown por empresa: `has_recent_account_touchpoint()` impede múltiplos toques na mesma conta em `account_cooldown_hours`. |

## Operação

| Termo | Definição |
|---|---|
| **tick** | Execução de um worker via pg_cron: `tick-cadence` (1:1), `tick-journeys`, `tick-marketing` (1:many), `alert-sweep`, `budget-reallocate`. Autenticados por header `apikey`. |
| **locked_until** | Lock otimista de 5 min num target sendo processado — impede execução dupla entre ticks. |
| **SKIP LOCKED** | Padrão de fila em Postgres: workers concorrentes nunca pegam a mesma linha. |
| **evals** | Harness de regressão do FATOR X: dataset `signal → mensagem esperada` (`agent_eval_cases`/`runs`). |
