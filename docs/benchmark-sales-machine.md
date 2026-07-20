# Benchmark SALES MACHINE vs. OSS de referência

Comparação técnica entre o **SALES MACHINE** (nossa stack: LUX + SINGU + FATOR X orquestrados por TanStack Start + Supabase) e três projetos open source do segmento "outbound / SDR com IA multicanal".

> Fonte primária: leitura direta dos repositórios no GitHub (READMEs, commits, adapters, schema Prisma) em julho/2026. Onde a evidência é indireta, está marcado como *reconstruído/inferido*.

---

## 1. Resumo executivo

### kizunuhq/kizunu — *parcialmente inacessível*
O repo `kizunuhq/kizunu` está retornando **404** no GitHub. Só sobra o `kizunu-legacy` (arquivado). Pelo que ficou em cache: NestJS + Postgres, foco em **execução de cadência** (Workspace → Journey → Cadence → audit_events) e integração **nativa com WhatsApp Cloud API via Meta Coex (Embedded Signup)**. Sem ICP discovery, sem enriquecimento, sem agente de IA. **Veredito:** referência limitada — só serve para copiar o padrão de máquina de estados de Journey e o fluxo Meta Coex se um dia formos direto ao WhatsApp Cloud API.

### personizeai/revenue-os — MIT, 9★
Pipelines TypeScript orquestradas por **Trigger.dev**, com "memória" delegada ao SDK proprietário `@personize/sdk`. Forte em **email** (IMAP/SMTP nativo, threading real, warmup, rotação de sender, health monitoring) e em **coordenação por conta** ("Account Strategizer" evita carpet-bombing entre contatos da mesma empresa). LinkedIn via **HeyReach**, voz via Bland/Vapi/ElevenLabs. **Não tem WhatsApp, SMS nem Instagram.** IA gera sequências de email + classifica intent de resposta — não é agente conversacional persistente. **Veredito:** melhor referência de **deliverability/anti-ban de email** e de **coordenação multi-contato por conta**.

### Kazemkhani/outbound-intelligence-engine — "proprietary" (não é OSI), 1★
Monorepo TS (Turbo + Next.js + Prisma + Inngest). Mais maduro em **descoberta de ICP** (Google Places para SMBs locais + waterfall Apollo/Clay/Explorium com teto de custo) e **sinais comportamentais com decay** (TheirStack/PredictLeads/Exa). Email via **Smartlead**, LinkedIn e WhatsApp via **Unipile** (ambos off por default). Diferencial central: **human-approval gate obrigatório** antes de qualquer envio ("autonomia acelera construir, nunca enviar"). Sem SMS, sem Instagram. **Ressalva:** apesar de publicamente legível, o README declara "proprietary" e o GitHub reporta `NOASSERTION` — não é OSS por definição OSI, então não podemos copiar código, só padrões.

---

## 2. Matriz comparativa

| Dimensão | kizunu (reconstruído) | revenue-os | outbound-intelligence-engine | **SALES MACHINE (hoje)** |
|---|---|---|---|---|
| **Stack** | NestJS + Postgres | TS pipelines + Trigger.dev + SDK externo | TS monorepo + Next + Prisma + Inngest | **TanStack Start + Supabase + pg_cron** |
| **Descoberta de ICP** | ❌ | Seed via CRM + Apollo people search | ✅ Google Places + waterfall (Apollo/Clay/Explorium) | ✅ **LUX** (ICP + oracle-search-decisors) |
| **Enriquecimento** | ❌ | Apollo + Tavily | Waterfall multi-provider | ✅ **LUX** (Lusha) + **SINGU** (perfil comportamental) |
| **Perfil comportamental** | ❌ | Sender health | Sinais com decay temporal | ✅ **SINGU** (next-best-action, playbook) |
| **Agente conversacional de IA** | ❌ | Geração de sequência + intent classification | Personalização de opener, human-gate obrigatório | ✅ **FATOR X** (agent-workflow-runner, cérebro treinado) |
| **Cadência multicanal** | Execução core | Presets (aggressive/standard/enterprise) | Sequencing + enrolment via Inngest | ✅ `cadence_rules` + `campaign_targets` + tick pg_cron |
| **WhatsApp** | 🟢 Nativo (Meta Coex) | ❌ | 🟡 Unipile (off default) | 🟢 **SINGU (Evolution API)** |
| **Email** | ❌ | 🟢 Nativo IMAP/SMTP + Smartlead | 🟡 Smartlead | 🟢 **SINGU sequence-processor** |
| **SMS** | ❌ | ❌ | ❌ | 🟢 **SINGU send-sms-campaign** |
| **LinkedIn** | ❌ | 🟡 HeyReach | 🟡 Unipile | 🔴 **Stub** (`pending_provider`) |
| **Instagram** | ❌ | ❌ | ❌ | 🔴 **Stub** (`pending_provider`) |
| **Warmup / anti-ban** | ❌ | 🟢 Ramp + rotação + auto-pause + limite diário | Delega para Smartlead/Unipile | 🟡 `channel_quotas` (só quota, sem warmup) |
| **Send-gate humano** | ❌ | ❌ | 🟢 Obrigatório | ❌ (envio autônomo pelo agente) |
| **Coordenação por conta** | ❌ | 🟢 Account Strategizer | Score por company + tier | 🟡 Campanha agrupa, mas não coordena mensagens entre decisores |
| **Webhooks entrantes** | Meta | HeyReach + call providers + Slack + Zapier | HubSpot + 6 providers | ✅ LUX + SINGU + FATOR X (HMAC) |
| **CRM próprio** | Sync com CRM externo | Sync HubSpot/Salesforce | Sync HubSpot | ❌ (delegado ao SINGU) |
| **Licença** | AGPL-3.0 | MIT | NOASSERTION ("proprietary") | Privado |
| **Última atividade** | ~jun/2026 (cache) | abr/2026 | jul/2026 | ativo |

Legenda: 🟢 nativo/completo · 🟡 parcial ou via 3rd-party · 🔴 stub · ❌ ausente

---

## 3. Gaps do SALES MACHINE que esses projetos já resolvem melhor

1. **Warmup e health de sender (revenue-os).** Hoje temos `channel_quotas` para limite/hora, mas não temos ramp-up gradual de mailbox nem *auto-pause* quando bounce/reply-rate degrada. Isso vira problema no minuto em que ligarmos email em volume real via SINGU.
2. **Coordenação por conta / anti-carpet-bombing (revenue-os).** Quando o LUX devolve 4 decisores da mesma empresa e enfileiramos todos, o agente pode acabar mandando 4 aberturas quase idênticas para o mesmo domínio. O "Account Strategizer" do revenue-os é o padrão a copiar: uma decisão por conta que escolhe QUEM aborda primeiro e em qual canal.
3. **Sinais com decay temporal (OIE).** Nosso `sales_machine_events` guarda eventos, mas não temos scoring que perde valor no tempo. Um sinal "levantou a mão há 90 dias" hoje pesa igual a "abriu email ontem".
4. **Send-gate humano opcional (OIE).** Não precisamos torná-lo obrigatório como o OIE, mas ter um modo *"draft only — humano aprova"* por campanha é barato e destrava vendas para contas grandes/sensíveis.
5. **Retry/backoff durável (revenue-os/OIE via Trigger.dev/Inngest).** Nosso worker é um tick pg_cron simples. Falha de rede num turno = touchpoint fica em `failed` sem retry automático. Precisamos de política de retry com backoff exponencial e dead-letter.
6. **Threading real de email (revenue-os).** IMAP com `In-Reply-To`/`References` para conversas continuarem no mesmo thread. Isso depende do SINGU expor esses headers no sequence-processor.
7. **Eval harness de qualidade de mensagem (OIE).** OIE valida com casos rotulados que o opener gerado por Claude respeita o sinal. Faz sentido termos suite equivalente para o FATOR X antes de escalar volume.

---

## 4. Ideias reaproveitáveis (padrões, não código)

- **Padrão "Journey" do kizunu.** Máquina de estados explícita por lead (running/paused/replied/stopped/lost) com `audit_events` imutáveis. Nosso `campaign_targets` pode adotar o mesmo shape para virar timeline auditável.
- **Adapter pattern do OIE.** Cinco interfaces estáveis (`ICPDiscovery`, `Enrichment`, `EmailSender`, `LinkedInSender`, `CRMSync`) com providers plugáveis por trás. Isso encaixa exatamente no momento em que trocarmos os stubs de LinkedIn/Instagram por Unipile/Phantombuster/etc.
- **Presets de cadência do revenue-os** (`aggressive`/`standard`/`enterprise`). Hoje temos uma regra de cadência semeada; virar preset selecionável por campanha é 1h de trabalho e melhora muito a UX.
- **Waterfall de enriquecimento com teto de custo (OIE).** Se um dia SINGU/Lusha não achar contato, cair pra Apollo → Clay com orçamento máximo por lead. Padrão: `enrichmentBudgetUsd` por campanha.
- **Human-in-the-loop opcional (OIE).** Flag `requires_approval` em `campaigns_orchestration`; touchpoint fica em `pending_approval` antes de `sent`.
- **Slack digest diário (revenue-os).** Resumo automático das últimas 24h da campanha no canal do time. Simples e alto valor percebido.

---

## 5. O que continua único no SALES MACHINE

- **Combinação LUX + SINGU + FATOR X** — nenhum dos três OSS tem descoberta de ICP + CRM comportamental + agentes de IA treinados sob mesmo cinto. revenue-os precisa de CRM externo + HeyReach; OIE precisa de Smartlead + Unipile; kizunu não tem nada disso.
- **Agente treinado pelo cliente (FATOR X).** revenue-os e OIE usam LLM genérico com prompt. Nosso agente carrega base de conhecimento própria (cerebro-query) — é conversação com contexto, não geração de opener isolado.
- **Cinco canais no mesmo pipeline.** Nenhum dos três cobre WhatsApp + Email + SMS + LinkedIn + Instagram simultaneamente. Mesmo com LI/IG em stub, a arquitetura já está pronta para eles.
- **Multi-tenant nativo via RLS Supabase.** revenue-os assume 1 tenant, OIE é single-workspace, kizunu tem noção de Workspace mas não RLS. Nosso setup escala para várias operações do mesmo cliente sem forkar deploy.
- **Backend serverless de baixa fricção.** Sem monorepo Turbo, sem Inngest self-hosted, sem SDK proprietário externo — só Supabase + TanStack Start.

---

## 6. Recomendações acionáveis

### v1 (próximas 1–2 sprints, sem quebrar o que está no ar)
1. **Adotar máquina de estados explícita em `campaign_targets`** (running/paused/replied/stopped/lost/completed) + tabela `campaign_target_events` como audit log — padrão kizunu.
2. **Presets de cadência** selecionáveis por campanha (`aggressive` 5d, `standard` 10d, `enterprise` 21d) semeados em `cadence_rules`.
3. **Retry/backoff no tick-cadence**: touchpoint em `failed` reenfileira até N vezes com backoff exponencial; depois vai para `dead_letter`.
4. **Flag `requires_approval` em campanha** + tela mínima de aprovação (lista de touchpoints em `pending_approval` com botões aprovar/rejeitar).
5. **Coordenador por conta**: antes de disparar turno para um decisor, checar se outro decisor da mesma `entity_id`/company sofreu touchpoint nas últimas 48h — se sim, pular ou trocar canal.

### v2 (próximo trimestre)
6. **Warmup de sender de email** conversando com SINGU: expor mailbox health (bounce/reply/spam rate) via API e implementar ramp-up (50/dia → +10/dia até teto).
7. **Adapter pattern para LinkedIn/Instagram**: interface `SocialSender` com implementações `UnipileSender`, `PhantombusterSender` — trocar stub sem tocar no orquestrador.
8. **Scoring com decay** sobre `sales_machine_events`: função SQL `signal_score(entity_id)` com meia-vida configurável por tipo de sinal.
9. **Eval harness FATOR X**: dataset rotulado de "sinal → mensagem esperada" rodando em CI antes de cada deploy do agente.
10. **Threading real de email**: garantir com SINGU que `Message-ID`/`In-Reply-To`/`References` são preservados para respostas caírem no mesmo thread.

### Fora do radar por enquanto
- Migrar orquestração para Trigger.dev/Inngest. pg_cron + tick endpoint já dá conta do volume esperado e mantém a stack simples.
- Construir CRM próprio. SINGU já é o CRM — reinventar é retrabalho.
- Copiar código do OIE. Licença não permite; usar apenas como referência de padrões.

---

*Documento vivo — atualizar quando um dos projetos mudar de licença/arquitetura ou quando o SALES MACHINE fechar um dos gaps listados.*