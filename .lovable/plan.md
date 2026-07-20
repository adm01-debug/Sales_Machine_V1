## Benchmark detalhado: Kizunu vs Revenue OS vs Outbound Intelligence Engine

Vou fazer uma análise comparativa de 3 projetos open source contra o plano do SALES MACHINE, sem escrever código nesta etapa. Entrego um documento em `docs/benchmark-sales-machine.md`.

### Projetos analisados
1. **Kizunu** (`kizunuhq/kizunu`) — motor de sales engagement multicanal
2. **Revenue OS** (`personizeai/revenue-os`) — alternativa OSS ao HubSpot Prospecting Agent
3. **Outbound Intelligence Engine** (`Kazemkhani/outbound-intelligence-engine`) — descoberta ICP + sequências

### Método
Para cada projeto vou levantar via web/GitHub:
- Stack e arquitetura (banco, workers, filas, cron)
- Modelo de dados (contas, contatos, campanhas, cadências, touchpoints)
- Como fazem descoberta/ICP (equivalente ao nosso LUX)
- Como fazem enriquecimento e perfil comportamental (equivalente ao SINGU)
- Como orquestram agentes de IA nas conversas (equivalente ao FATOR X)
- Como tratam cada canal: WhatsApp, Email, SMS, LinkedIn, Instagram (nativo x stub x provedor terceiro)
- Anti-ban / warmup / rate limits
- Webhooks e integrações externas
- Licença e maturidade (stars, último commit, issues abertas)

### Entregável (`docs/benchmark-sales-machine.md`)
1. **Resumo executivo** — 1 parágrafo por projeto + veredito de fit.
2. **Matriz comparativa** — tabela `Recurso × Kizunu × Revenue OS × OIE × SALES MACHINE (hoje)`, cobrindo: ICP discovery, enrichment, agent orchestration, cadência multicanal, WhatsApp, Email, SMS, LinkedIn, Instagram, quotas/anti-ban, webhooks, CRM interno, UI cockpit, licença.
3. **Gaps do SALES MACHINE** que esses projetos já resolvem melhor (ex: warmup de sender, retry/backoff de cadência, unified inbox).
4. **Ideias reaproveitáveis** — padrões de UX e schema que vale copiar (sem forkar código, respeitando licenças).
5. **O que continua único no SALES MACHINE** — a combinação LUX + SINGU + FATOR X com agentes treinados próprios.
6. **Recomendações acionáveis** para a v1 e v2 (ex: adotar padrão de "step runner" do Kizunu; espelhar telemetria de campanha do Revenue OS).

### Fora de escopo
- Nenhuma mudança de código, schema ou secrets.
- Nenhum fork/import de código de terceiros.

Depois de aprovar, entro em build mode só para criar o markdown.
