# Visão do Produto — Sales_Machine_V1

> Fonte: código real (rotas, migrations, engines) + `docs/benchmark-sales-machine.md` + `docs/qa-report-2026-07-22.md`. Inferências marcadas `[CONFIRMAR]`.
> Última revisão: 2026-08-29.

## O que é

**Motor de prospecção outbound com IA para B2B**, orquestrando um funil de sistemas especializados:

```
LUX (descoberta de ICP/leads)
  → SALES MACHINE (cadências multicanal 1:1 + broadcast 1:many)
  → SINGU (executor de canal / CRM)
  → FATOR X (geração de mensagens com IA)
  → PROMO CHAMPIONS (handoff de deals quentes)
```

Complementos: **FUXICO** (tracking de abertura/clique `[CONFIRMAR: escopo exato]`), módulo de **journeys** visuais (trigger/send/wait/condition/split/goal/exit), **lead forms** com double opt-in, **audiences**, A/B testing (`campaign_variants`), budgets por canal com realocação automática, e harness de **evals do agente**.

## Problema que resolve

Prospecção outbound em escala normalmente falha por: (1) mensagens genéricas, (2) falta de coordenação entre toques na mesma conta, (3) queima de reputação de sender, (4) risco jurídico (LGPD/spam). O Sales Machine ataca os quatro: IA por sinal (FATOR X), cooldown por conta (`has_recent_account_touchpoint`), warmup de sender com cap diário (`compute_daily_cap`), e consentimento como gate obrigatório (`check_consent`).

## Objetivos (extraídos do que o sistema já faz)

1. **Outbound 1:1 automatizado mas seguro** — cadências multicanal (WhatsApp/email/SMS; LinkedIn/Instagram via stubs) com máquina de estados, retry/backoff, dead-letter e approval gate humano opcional.
2. **Broadcast 1:many com preflight** — journeys + marketing campaigns com validação de compliance de termos proibidos por nicho regulado antes do envio.
3. **Deliverability como cidadão de 1ª classe** — sender warmup, bounce tracking (webhook dedicado), cap diário.
4. **Compliance/LGPD embutido** — consent ledger, stop-words de opt-out, double opt-in em formulários, disclosure de IA, exportação/apagamento de dados pessoais.
5. **Qualidade do agente medida** — eval harness com dataset rotulado (`agent_eval_cases`).

## KPIs `[CONFIRMAR com o dono — inferidos das tabelas]`

- Taxa de resposta por campanha/canal (`contact_touchpoints.status = replied`)
- Pipeline gerado (handoffs para PROMO CHAMPIONS)
- Bounce rate / spam reports por sender (`sender_health`, `email_deliverability_events`)
- ROI por canal (`channel_roi_stats`, `channel_budgets`)
- Opt-out rate e tempo de reação a stop-words (`consent_ledger`)
- Eval pass rate do FATOR X (`agent_eval_runs`)

## Não-objetivos (o que o produto NÃO é)

- **Não é CRM** — SINGU já é o CRM; reinventar é retrabalho (decisão registrada no benchmark).
- **Não é plataforma de inbound/marketing de conteúdo.**
- **Não copia código do OIE** (referência de padrões apenas — licença não permite).
- **Não usa Trigger.dev/Inngest** — pg_cron + tick endpoints dão conta do volume esperado (decisão registrada).

## Estado atual (2026-08-29)

Produto funcional em desenvolvimento ativo via Lovable: 45 migrations aplicadas, 478 testes (baseline com 61 falhas pré-existentes — ver pendências), 10/10 gaps do benchmark de julho fechados (máquina de estados, presets, backoff, approval gate, cooldown por conta, etc.).
