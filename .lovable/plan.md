# SALES MACHINE — Prospecção em lote com dossiê

## Objetivo
Usuário abre lista de empresas ICP (vindas do LUX), seleciona várias, e o sistema roda automaticamente: enriquece decisores, monta dossiê (LUX + SINGU + FATOR X), dispara cadência multicanal via agente treinado — sem aprovação intermediária.

## Novas telas (dentro de `_authenticated/`)

1. **`/companies`** — Lista de empresas ICP
   - Puxa via `luxClient.listCompanies()` (server fn nova `listIcpCompanies`)
   - Colunas: nome, ramo, porte, status na Sales Machine (nova / em cadência / concluída)
   - Checkbox multi-select + botão **"Iniciar prospecção em lote"**
   - Seleção de campanha (cadência + agente FATOR X) antes de disparar

2. **`/companies/$id`** — Dossiê da empresa
   - **Perfil (LUX):** ramo, porte, sinais de intent
   - **Decisores:** lista via `luxClient.searchDecisors` + botão "Enriquecer" (Lusha)
   - **Histórico e sentimento (SINGU):** `singuClient.nextBestAction` + últimas interações
   - **Sugestão do agente (FATOR X):** `fatorxClient.quickTest` gera prévia da mensagem de abordagem por canal
   - Botão "Adicionar à campanha X"

3. **`/campaigns`** (já existe placeholder) — CRUD mínimo de campanha
   - Nome, agente FATOR X (agent_id), canais habilitados (checkbox: whatsapp, email, sms, linkedin*, instagram*), cadência (dias entre toques)
   - *LinkedIn e Instagram ficam como stub: touchpoint gravado com status `pending_provider`*

## Backend

### Novas server functions (`src/lib/orchestrator.functions.ts`)
- `listIcpCompanies({ icp_id?, limit? })` → chama `luxClient.listCompanies`, faz join com `entity_map` para marcar status
- `getCompanyDossier({ lux_company_id })` → paraleliza LUX (decisores) + SINGU (histórico/NBA) + FATOR X (sugestão) e devolve DTO único
- `enqueueBatchProspection({ lux_company_ids, campaign_id })` → para cada empresa: upsert em `entity_map`, insere linha em `campaigns_orchestration_targets` (nova tabela), grava evento `batch_enqueued` em `sales_machine_events`
- `runNextCadenceStep({ entity_id, campaign_id })` → resolve próximo canal segundo `cadence_rules` + `channel_quotas`, chama `dispatchAgentTurn`, roteia envio real via `/agent-tools/send-message`

### Nova tabela `campaign_targets`
```
id uuid, campaign_id uuid FK, entity_id uuid FK,
current_step int default 0, next_run_at timestamptz,
status text check (status in ('queued','running','done','failed','paused')),
last_error text, created_at, updated_at
```
Com GRANTs padrão + RLS (admin/operator via `has_role`).

### Worker de cadência
- Cron `pg_cron` a cada 5 min → `POST /api/public/hooks/tick-cadence` (auth via `apikey` anon)
- Handler seleciona `campaign_targets` com `next_run_at <= now()` e status `queued`, chama `runNextCadenceStep`, atualiza `next_run_at` conforme `cadence_rules`

### Stub LinkedIn/Instagram
- Extender `/api/public/agent-tools/send-message` para aceitar `channel: 'linkedin' | 'instagram'`
- Grava `contact_touchpoints` com `status='pending_provider'` (sem chamar SINGU) — placeholder até contratar provedor

## Fluxo end-to-end
```text
/companies (LUX) → seleciona N + campanha → enqueueBatchProspection
   → campaign_targets (queued)
   → pg_cron tick → runNextCadenceStep por target
       → FATOR X gera mensagem (dispatchAgentTurn)
       → /agent-tools/send-message → SINGU (wpp/email/sms) ou stub (li/ig)
       → touchpoint gravado, next_run_at recalculado
```

## Fora de escopo desta entrega
- Envio real LinkedIn/Instagram (fica stub `pending_provider`)
- UI de edição visual de cadência (usa defaults + JSON)
- Analytics de campanha (só lista de touchpoints por enquanto)

## Detalhes técnicos
- Todas as server fns novas usam `requireSupabaseAuth`
- Migration única: cria `campaign_targets` + GRANTs + RLS + `cadence_rules` seed default (dia 0 wpp, dia 2 email, dia 4 li stub, dia 7 sms)
- Dossiê usa `Promise.allSettled` — falha em um sistema não quebra a tela
- Cron `pg_cron` agendado só depois que URL pública estiver disponível (mostro instrução na UI se `project_urls` não retornar published)
