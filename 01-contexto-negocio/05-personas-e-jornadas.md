# Personas e Jornadas — Sales_Machine_V1

> Personas derivadas do enum real `app_role` + telas existentes. `[CONFIRMAR]` = a validar com o dono.

## Personas (atores do sistema)

### 1. Admin (`app_role = admin`)
O dono da operação (primeiro usuário do tenant vira admin automaticamente). Tudo que o Operator faz, mais:
- Executa funções LGPD de apagamento de dados (único papel autorizado).
- `[CONFIRMAR]` Gerencia budgets por canal, integrações e secrets.
- Resolve dead-letters e revisa alertas críticos em `/ops`.

### 2. Operator (`app_role = operator`)
SDR/gestor de prospecção. Papel default de novos usuários. Jornada típica:
1. **Manhã:** `/dashboard` → saúde do funil; `/ops` → alertas ativos (budget, bounce, locks travados).
2. **Criação:** `/prospecting` → dispara ingestão/seleção LUX; `/campaigns` → nova campanha com preset de cadência; decide `requires_human_approval`.
3. **Supervisão:** `/approvals` → aprova/edita mensagens geradas pelo FATOR X antes do envio (quando o gate está ligado).
4. **Qualidade:** `/compliance` → violações de termos; `/deliverability` → saúde dos senders; `/evals` → regressões do agente.
5. **Broadcast:** `/journeys`, `/audiences`, `/library` (templates), `/forms` (captura).

### 3. Viewer (`app_role = viewer`)
Leitura (stakeholder/liderança) `[CONFIRMAR escopo exato de leitura nas policies]`.

### 4. O Lead (ator externo — o mais importante)
Não usa o sistema, mas é **afetado** por ele. Direitos garantidos por design:
- Só recebe mensagem se `check_consent()` passar.
- Pode dizer "pare" em qualquer canal → opt-out imediato (stop-words) ou link de descadastro assinado.
- Pode pedir exportação/apagamento dos seus dados (LGPD Art. 18).
- Sabe que fala com IA (disclosure na 1ª mensagem).

### 5. Sistemas (atores não-humanos)
LUX, SINGU, FATOR X, FUXICO, PROMO CHAMPIONS — autenticados por HMAC/apikey, comunicação só por webhooks/APIs contratadas (ver `05-contratos-api.md`).

## Fluxos críticos de ponta a ponta

### Fluxo A — Outbound 1:1 (o coração)
1. LUX descobre lead → `webhook/lux` → `sales_machine_events` + upsert `entity_map`.
2. Operator cria campanha → targets entram `queued`.
3. `tick-cadence` (1min): lock → `check_consent` ✓ → cooldown de conta ✓ → budget ✓ → FATOR X gera mensagem → (approval gate?) → SINGU envia → touchpoint `sent`.
4. Lead responde → `webhook/singu` → touchpoint `replied` → target state `replied` → **handoff PROMO CHAMPIONS**.
5. Lead diz "pare" → stop-word → `consent_ledger` opt-out → nenhum canal toca essa entity de novo.

### Fluxo B — Broadcast com compliance
1. Operator monta `/audiences` + template da `/library` → preflight valida termos proibidos do nicho → agenda/envia via `tick-marketing` → tracking FUXICO (open/click) → métricas por canal.

### Fluxo C — Captura inbound com double opt-in
1. Lead preenche `/f/:slug` → submission `pending` com token assinado → email de confirmação → `/confirmar?token=` → vira entity opt-in → entra em journey/cadência.
