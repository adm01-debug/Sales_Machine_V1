
# SALES MACHINE — Arquitetura e Integrações (v1)

Escopo desta entrega (definido com você): **arquitetura + integrações entre os 4 sistemas**. UI/telas completas, módulos de canal e agente ficam para entregas seguintes. CRM não será construído do zero: o **SINGU já é um CRM de vendas robusto** e será usado como tal.

---

## 1. Descoberta — o que cada projeto REALMENTE tem

Verificado lendo `supabase/functions/`, `supabase/migrations/` e docs de cada projeto:

### LUX IA (`PROMO LUX - V2`)
Sistema de **descoberta e enriquecimento de empresas ICP**.
- Tabelas: `companies`, `stakeholders`, `ipc_config`, `scrape_jobs`, `scrape_results`, `intent_signals`, `campaigns`, `workflows`, `workflow_runs`.
- Edge functions relevantes para nós: `gmaps-proxy`, `workflow-engine`, `lusha-search`, `lusha-decision-makers`, `lusha-reveal`, `oracle-search-decisors`, `oracle-enrich-contact`, `oracle-push-bitrix`, `public-api`, `webhook-dispatcher`, `campaign-dispatch`.
- Já expõe **`public-api`** e **`webhook-dispatcher`** — ponto de entrada natural para o SALES MACHINE consumir leads qualificados.

### SINGU CRM (`SINGU - V2`)
CRM de vendas + **motor comportamental** (DISC, NLP/PNL, Big Five, Enneagram, RFM, EQ, neuromarketing, hidden objections). **Já é o CRM** — não precisamos de outro.
- Tabelas centrais: `companies`, `contacts` (com role=`decision_maker`, `owner`, `influencer`), `interactions` (whatsapp/call/email/meeting/note/social com sentimento), `lux_intelligence` (integra LUX), cadências, alertas, insights.
- **Canais já implementados** (edge functions):
  - WhatsApp — `evolution-api`, `evolution-webhook`, `whatsapp-import`
  - Email — `email-finder`, `email-verifier`, `email-pipeline-health`, `sequence-processor`, `sequence-track`
  - SMS — `send-sms-campaign`
  - LinkedIn — `enrichlayer-linkedin`, `social-profile-scraper`, `social-behavior-analyzer`
- Motores: `lead-scorer`, `next-best-action`, `playbook-generator`, `disc-analyzer`, `objection-handler`, `conversation-analyzer`.
- Já tem hook `lux-trigger` + `lux-webhook` — integração com LUX **já está começada**.

### FATOR X — Nexus Agents Studio (`FATOR X - SUPER AGENTES IA - V2`)
Plataforma enterprise de **criação, treino, deploy e monitoramento de agentes IA**.
- 200+ tabelas, 63 edge functions, RBAC, guardrails 4-camadas, LGPD.
- Runtime de agentes: `llm-gateway`, `agent-workflow-runner`, `smolagent-runtime`, `graph-execute`, `quick-agent-test`.
- Memória: `cerebro-brain`, `cerebro-query`, `memory-manager`.
- Já expõe **`a2a-server`** (Agent-to-Agent protocol) e **`widget-proxy`** — ponto de entrada natural para o SALES MACHINE invocar agentes.
- Já tem `whatsapp-webhook` e `bitrix24-*` — sabe conversar com canais externos.

### CRM (PROMO CHAMPIONS)
Confirmado com você: seguir sem CRM próprio. **Usaremos o SINGU no papel de CRM.**

---

## 2. Papel do SALES MACHINE

Camada de **orquestração e cockpit unificado**, não duplicando funções já existentes. Responsabilidades:

1. **Cockpit único** de prospecção: dashboard que consolida LUX (pipeline de descoberta) + SINGU (pipeline de relacionamento) + FATOR X (conversas do agente).
2. **Orquestrador de cadências multicanal**: define quando/como o agente do FATOR X entra em contato com um decisor, em que canal, com que playbook do SINGU.
3. **Bus de eventos** entre os três sistemas via webhooks + tabela `sales_machine_events` local (auditoria + replay).
4. **Ponte de identidade**: mapeia `lux.company_id ↔ singu.company_id ↔ fatorx.thread_id` para que qualquer sistema referencie a mesma entidade.
5. **Governança de campanhas**: ICPs ativos, quotas por canal, opt-out/LGPD, aprovação humana antes de disparo em massa.

**O que o SALES MACHINE NÃO faz** (delega): scraping (LUX), enriquecimento (LUX/SINGU), CRM/interações (SINGU), execução de canal (SINGU Evolution/SMS/Email + LinkedIn/Instagram novos), raciocínio conversacional (FATOR X).

---

## 3. Arquitetura de integração

```text
                    ┌────────────────────────────────────┐
                    │         SALES MACHINE              │
                    │  (Cockpit + Orquestrador + Bus)    │
                    │                                    │
                    │  Tabelas locais:                   │
                    │   sales_machine_events             │
                    │   entity_map (lux↔singu↔fatorx)    │
                    │   campaigns_orchestration          │
                    │   cadence_rules                    │
                    │   channel_quotas                   │
                    └───┬────────────┬─────────────┬─────┘
                        │            │             │
        ┌───────────────▼──┐  ┌──────▼──────┐  ┌───▼───────────────┐
        │   LUX (ICP)      │  │ SINGU (CRM) │  │ FATOR X (Agentes) │
        │ public-api       │  │ evolution-  │  │ agent-workflow-   │
        │ webhook-         │  │  api        │  │  runner           │
        │  dispatcher      │  │ send-sms-   │  │ llm-gateway       │
        │ oracle-search-   │  │  campaign   │  │ a2a-server        │
        │  decisors        │  │ sequence-   │  │ whatsapp-webhook  │
        │ lusha-reveal     │  │  processor  │  │ cerebro-brain     │
        └──────────────────┘  │ lead-scorer │  └───────────────────┘
                              │ next-best-  │
                              │  action     │
                              │ playbook-   │
                              │  generator  │
                              └─────────────┘
```

### Fluxo canônico (happy path)

```text
1. LUX descobre empresa que bate ICP  →  webhook-dispatcher
2. SALES MACHINE recebe em /api/public/webhooks/lux
     - grava em sales_machine_events
     - upsert em entity_map
     - chama SINGU (upsert company + contacts a partir de stakeholders LUX)
3. SINGU enriquece contatos (email-finder, social-profile-scraper),
   calcula lead-scorer + disc-analyzer + next-best-action
4. SINGU dispara webhook "contact.qualified" → SALES MACHINE
5. SALES MACHINE aplica cadence_rules:
     - escolhe canal (LinkedIn → WhatsApp → Email → SMS)
     - respeita channel_quotas + horário do contato (SINGU cadence)
     - chama FATOR X agent-workflow-runner com contexto do SINGU
6. FATOR X executa o agente treinado, retorna mensagem/ação
7. SALES MACHINE roteia a mensagem para o canal escolhido (via SINGU)
8. Resposta do prospect volta pelo webhook do canal (SINGU) →
     SALES MACHINE → FATOR X (mesmo thread_id) → próximo turno
9. Cada evento vira interaction no SINGU (histórico completo do decisor)
```

---

## 4. Detalhes técnicos

### 4.1 Stack (SALES MACHINE)
- **TanStack Start** (template atual), TypeScript strict.
- **Lovable Cloud** próprio: banco isolado do LUX/SINGU/FATOR X, comunicação entre projetos **somente por HTTP** (edge functions públicas de cada um) — não compartilhamos schemas.
- **TanStack Query** para leitura, **createServerFn** para orquestração autenticada.
- **Server routes públicos** sob `/api/public/*` para receber webhooks dos três sistemas (assinatura HMAC obrigatória).

### 4.2 Tabelas locais do SALES MACHINE
- `sales_machine_events(id, source, event_type, payload jsonb, received_at, processed_at, status)` — auditoria + replay.
- `entity_map(sm_entity_id, kind, lux_id, singu_id, fatorx_thread_id)` — bridge de identidades.
- `campaigns_orchestration(id, name, icp_filter jsonb, channels[], agent_id, cadence_rule_id, status)`.
- `cadence_rules(id, steps jsonb)` — cada step tem canal, delay, condição, template/playbook.
- `channel_quotas(user_id, channel, daily_cap, current_count, reset_at)` — anti-block em LinkedIn/WhatsApp.
- `contact_touchpoints(id, sm_entity_id, channel, direction, payload, status, agent_thread_id)` — espelho leve das interactions do SINGU para dashboards rápidos.
- `secrets/config` para URLs e HMAC secrets dos três projetos.
- RLS obrigatório em todas com `user_id`/`org_id`. GRANTs explícitos para `authenticated` e `service_role`.

### 4.3 Contratos de integração (endpoints reais)

**LUX → SALES MACHINE (inbound webhook)**
- `POST /api/public/webhooks/lux` — eventos `company.qualified`, `stakeholders.enriched`, `intent.signal`.
- Verificação HMAC-SHA256 do corpo, secret `LUX_WEBHOOK_SECRET`.

**SALES MACHINE → LUX (outbound)**
- `GET {LUX_URL}/functions/v1/public-api?resource=companies&icp_id=…` — puxar leads sob demanda.
- `POST {LUX_URL}/functions/v1/oracle-search-decisors` — pedir decisores de uma empresa.

**SINGU → SALES MACHINE (inbound webhook)**
- `POST /api/public/webhooks/singu` — eventos `contact.qualified`, `interaction.received`, `lead_score.changed`, `objection.detected`.
- HMAC com `SINGU_WEBHOOK_SECRET`.

**SALES MACHINE → SINGU (outbound)**
- `POST {SINGU_URL}/functions/v1/enrich-contacts` (a partir de payload LUX).
- `POST {SINGU_URL}/functions/v1/next-best-action` (contact_id).
- `POST {SINGU_URL}/functions/v1/evolution-api` (WhatsApp send).
- `POST {SINGU_URL}/functions/v1/send-sms-campaign`.
- `POST {SINGU_URL}/functions/v1/sequence-processor` (email cadence).
- `POST {SINGU_URL}/functions/v1/playbook-generator` (script sob demanda).

**FATOR X → SALES MACHINE (inbound webhook)**
- `POST /api/public/webhooks/fatorx` — `agent.message`, `agent.tool_call`, `agent.completed`, `agent.handoff_human`.

**SALES MACHINE → FATOR X (outbound)**
- `POST {FATORX_URL}/functions/v1/agent-workflow-runner` — invoca agente por `agent_id + thread_id + input`.
- `POST {FATORX_URL}/functions/v1/quick-agent-test` — testes.
- `POST {FATORX_URL}/functions/v1/cerebro-query` — consulta memória do agente antes de responder.

### 4.4 Tools que o agente do FATOR X vai chamar de volta
Registrar como tools do agente (function calling) no FATOR X, apontando para endpoints do SALES MACHINE:
- `sm.get_prospect(sm_entity_id)` — retorna perfil consolidado (LUX + SINGU).
- `sm.send_message(sm_entity_id, channel, body, media?)` — roteia para SINGU.
- `sm.log_interaction(sm_entity_id, kind, content, sentiment?)` — grava no SINGU.
- `sm.schedule_followup(sm_entity_id, delay, template)` — insere step em cadência.
- `sm.request_human_handoff(sm_entity_id, reason)` — pausa cadência e alerta operador.
- `sm.mark_opportunity(sm_entity_id, stage)` — atualiza pipeline no SINGU.

### 4.5 Segurança
- HMAC em 100% dos webhooks (verificação timing-safe, corpo raw).
- `SUPABASE_SERVICE_ROLE_KEY` **nunca** no cliente; apenas em server functions após `requireSupabaseAuth` + verificação de role (`has_role`).
- RLS em todas as tabelas locais; `sales_machine_events` visível só para admins.
- Rate-limit por usuário + channel_quotas para respeitar limites do LinkedIn/WhatsApp.
- LGPD: opt-out obrigatório em `contact_touchpoints`, endpoint de export/deletion.

### 4.6 Canais desta v1 (você pediu "todos")
- **WhatsApp**, **Email**, **SMS** → funcionam **de imediato** via edge functions já existentes no SINGU.
- **LinkedIn** → v1 usa `enrichlayer-linkedin` do SINGU para dados. Envio de InMail/mensagem exige provedor externo (Unipile / HeyReach / LinkedIn Sales Navigator) — **NÃO existe hoje** em nenhum dos projetos; será novo módulo do SALES MACHINE (provider a definir depois).
- **Instagram** → **NÃO existe hoje** em nenhum dos projetos; será novo módulo do SALES MACHINE (Meta Graph API + verificação de conta business, também a definir).

Marco: LinkedIn/Instagram entrarão como stubs nesta entrega (contrato e fila prontos, provedor plugável na próxima).

---

## 5. Entregas desta iteração (arquitetura + integrações)

1. **Bootstrap do projeto**: Lovable Cloud habilitado, auth email + Google, `_authenticated` layout, tema (a definir na próxima iteração de UI).
2. **Migrations** com as 6 tabelas locais, RLS, GRANTs, enums, índices, `has_role`.
3. **Secrets**: `LUX_URL`, `LUX_WEBHOOK_SECRET`, `LUX_SERVICE_KEY`, `SINGU_URL`, `SINGU_WEBHOOK_SECRET`, `SINGU_SERVICE_KEY`, `FATORX_URL`, `FATORX_WEBHOOK_SECRET`, `FATORX_AGENT_ID_DEFAULT`.
4. **3 server routes públicos** (`/api/public/webhooks/{lux,singu,fatorx}`) com verificação HMAC + gravação em `sales_machine_events`.
5. **6 server routes públicos** para as tools do agente (`/api/public/agent-tools/*`) com verificação de token do agente.
6. **Server functions** (`createServerFn`) autenticadas para: importar lote de leads do LUX, disparar cadência para um contato, invocar agente, aprovar/pausar campanha.
7. **Módulo `src/integrations/{lux,singu,fatorx}/client.ts`** com wrappers tipados dos endpoints externos.
8. **Página cockpit mínima** (`/`) mostrando: leads recém-chegados do LUX, conversas ativas do agente, últimos eventos do bus, quotas de canal. UI polida fica para entrega de "UI/telas completas".
9. **README + diagrama** documentando o contrato de cada webhook.

Entregas futuras (fora desta iteração): UI premium com design directions, playbook por ICP, LinkedIn/Instagram providers reais, agente conversacional treinado end-to-end no FATOR X, inbox unificado, relatórios.

---

## 6. Riscos e premissas

- **Premissa**: os três projetos permitem chamadas HTTP entre si (edge functions públicas do LUX/SINGU/FATOR X). Confirmado — os três já expõem endpoints públicos (`public-api`, `a2a-server`, `webhook-dispatcher`).
- **Premissa**: você concorda em usar SINGU como CRM oficial (não haverá schema de CRM próprio no SALES MACHINE).
- **Risco**: escrever direto no banco do SINGU quebraria RLS. Toda escrita via **edge functions do SINGU** (que já validam auth).
- **Risco**: LinkedIn/Instagram nativos exigem provedor pago; nesta v1 ficam plugáveis, sem envio real.
- **Risco**: LUX e SINGU já têm hook parcial (`lux-trigger`/`lux-webhook`). Vamos **reaproveitar** — o SALES MACHINE fica no meio como observador + orquestrador, sem quebrar o que já flui.
