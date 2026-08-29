# Definition of Done — Sales_Machine_V1

> Baseado no Guia PromptOps v2.0 (sec. 11). Adaptado à realidade deste repo: **baseline de lint/test pré-existente vermelha** (2026-08-29). A régua aqui é: **nunca piorar a baseline; sempre melhorar ou manter no que tocou**.

## Checklist pré-entrega universal (toda tarefa de código)

```
[ ] Li o estado real antes de mudar (arquivos, schema, logs) — Lei 4
[ ] O diff contém APENAS a tarefa — Lei 3 / Lei 11
[ ] Verificação executada com output real em mãos — Lei 10 / Lei 1
[ ] Nenhum placeholder/TODO em código entregue — Lei 6
[ ] Nenhum segredo em código/log/resposta
[ ] Erros: todo caminho de falha tem comportamento definido (não engolido)
[ ] Contratos consumidos por outros: verificado que não quebrei consumidor — Lei 7
[ ] Regras críticas do banco respeitadas (as 10 — ver CLAUDE.md)
[ ] Mudança estrutural ⇒ dump-arquitetura.json regerado + docs de contexto atualizados — Lei 12
[ ] `bun test` e `bun run lint`: meu diff não adiciona NENHUMA falha nova vs. baseline
[ ] Relatório: resultado primeiro, evidência, e o que NÃO foi verificado
```

## DoD por tipo de tarefa

**Bug fix:** causa raiz evidenciada (log/query/request real, não suposição) · fix mínimo · teste de regressão vermelho→verde · dados corrompidos tratados ou reportados · armadilha registrada no CLAUDE.md se aplicável.

**Feature (fatia vertical):** migration nova (nunca editar aplicada) + código de todas as camadas + testes unitários dos fluxos de erro + teste do contrato (server fn com Zod) · estados de UI (loading/erro/vazio/sucesso) · dump atualizado.

**Migração de schema:** reversível ou com plano de rollback declarado · **produção sempre exige aprovação humana** (ver matriz de autonomia) · query de verificação pós-migração executada · se toca tabelas do funil (`campaign_targets`, `contact_touchpoints`, `consent_ledger`, `entity_map`), revisar as 10 regras críticas antes.

**Webhook/endpoint público:** HMAC-SHA256 com timing-safe compare · replay protection (`ON CONFLICT DO NOTHING` em `sales_machine_events`) · payload validado · erro do provedor externo não derruba o endpoint (5xx → retry/dead-letter, não crash).

**Envio de mensagem (qualquer canal):** `check_consent()` chamado antes · janela de horário respeitada · disclosure de IA na 1ª mensagem · opt-out grava `consent_ledger` imediatamente. **Sem exceções, mesmo em teste manual.**

**Auditoria:** todo achado com evidência arquivo:linha/output · severidade · patch para CRÍTICOS/ALTOS com teste que prova a correção.

**Documentação de contexto:** fatos contra o código/migrations reais (não contra outros docs) · inferências marcadas `[CONFIRMAR]` · data e fonte declaradas.

**Refatoração:** rede de segurança (testes existentes do módulo) confirmada antes · zero asserção alterada · suíte igualmente verde/vermelha antes e depois (dois outputs colados).
