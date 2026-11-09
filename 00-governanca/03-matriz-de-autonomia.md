# Matriz de Autonomia — Sales_Machine_V1

> O que o agente decide sozinho vs. o que exige pergunta/aprovação (Guia PromptOps v2.0, sec. 7.2), calibrado para este repo e para o fluxo Lovable.

## ✅ Executa direto (sem pedir)

| Situação | Observação |
|---|---|
| Ler qualquer coisa (código, log, schema, migrations) | Investigação nunca precisa de permissão |
| Nomes de arquivo/variável, estrutura interna | Seguindo convenções do CLAUDE.md |
| Escrever código, criar arquivos de docs/contexto | Dentro do escopo da tarefa |
| Commit atômico em branch própria criada nesta sessão | Nunca em `main` — ver `AGENTS.md` > Fluxo Git. O sync com o Lovable acontece quando a branch é mergeada em `main`, não antes |
| Rodar testes, lint, builds, o gerador de dump | Sempre que relevante |
| Escolha de lib já presente na stack aprovada | Registrar 1 linha de justificativa |
| Assunção sobre requisito ambíguo e barata de reverter | Declarar a assunção no relatório |
| Correção de docs de contexto desatualizados | Marcando fonte e data |

## ⚠️ Pergunta antes (aprovação explícita)

| Situação | Por quê |
|---|---|
| **Migration em produção** (aplicar no Supabase Cloud) | Dados reais de leads/clientes; sempre com plano de rollback |
| Mudança de contrato público (payload de webhook, assinatura de server fn consumida pela UI) | Consumidores externos quebram |
| Lib nova na stack / bump de versão major | Decisão de arquitetura |
| Remover as edge functions legadas (F9) ou deletar `package-lock.json` | Pendências abertas do dono |
| Saneamento em massa da baseline (lint --fix global, correção dos 61 testes) | Escopo próprio, grande demais para pegar carona em outra tarefa |
| Custo financeiro novo (serviço pago, upgrade de plano, volume de envios) | Dinheiro |
| Deploy / mudança de pg_cron em produção | Afeta envios reais |

## 🚫 NUNCA, mesmo com aprovação verbal genérica (exige decisão formal do dono)

| Situação | Por quê |
|---|---|
| **Bypassar ou enfraquecer `check_consent()`** / qualquer gate de consentimento | LGPD + reputação de sender — irreversível |
| **Desabilitar RLS** em qualquer tabela | Multi-tenant; dados pessoais |
| **Apagar dados pessoais fora da função LGPD dedicada** | Rastro legal obrigatório |
| Force-push / rebase / amend de histórico publicado | Destrói o histórico no Lovable (ver AGENTS.md) |
| Commitar segredos, `.env`, dumps com PII real | Vazamento irreversível |
| Enviar mensagens reais para leads em "teste" | Spam real; usar apenas ambiente/seed de teste |
| Editar migration já aplicada | Quebra a cadeia de reprodutibilidade do schema |

> Dúvida entre "pergunta" e "executa"? Pergunta. Uma pergunta a mais custa segundos; uma ação irreversível errada custa o projeto.
