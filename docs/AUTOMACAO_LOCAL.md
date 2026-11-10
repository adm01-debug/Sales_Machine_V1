# Automação local — Sales_Machine_V1

O dispatcher `scripts/automation.mjs` liga as suites, o motor de manutenção e o adaptador de grafo. O perfil versionado `scripts/automation.config.json` é a fonte dos aliases e do registro exato de scripts. Apenas ferramentas determinísticas locais: não há chamadas de IA nem cobrança de API de IA. O CI usa minutos do GitHub Actions sujeitos ao plano da conta; execução local usa os recursos da máquina.

## Comandos

| Alias                        | Comando executado                                       | Efeito                                                                                |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `automation:doctor`          | `node scripts/automation.mjs doctor`                    | Verifica arquivos, aliases, registros e instalação local de hooks.                    |
| `automation:test`            | `node scripts/automation.mjs test`                      | Roda exclusivamente as suites registradas abaixo.                                     |
| `automation:check`           | `node scripts/automation.mjs check --ref HEAD`          | Inspeciona a referência HEAD em worktree isolada.                                     |
| `automation:heal`            | `node scripts/automation.mjs heal --ref origin/main`    | Propõe e valida correções limitadas a partir de origin/main; não faz push.            |
| `automation:nightly`         | `node scripts/automation.mjs nightly --ref origin/main` | Atualiza o grafo e tenta manutenção isolada; relata as duas falhas independentemente. |
| `automation:graph`           | `node scripts/automation.mjs graph`                     | Encaminha subcomandos do grafo; acrescente status, query, path ou explain.            |
| `automation:status`          | `node scripts/automation.mjs graph status`              | Mostra a situação local do grafo.                                                     |
| `automation:install-hooks`   | `node scripts/automation.mjs install-hooks`             | Instala pontes locais reversíveis, encadeando hooks originais.                        |
| `automation:uninstall-hooks` | `node scripts/automation.mjs uninstall-hooks`           | Restaura o hooksPath anterior, recusando sobrescrever alteração de terceiros.         |

O comando estático para CI é `node scripts/automation.mjs doctor --static`. Ele verifica contratos; não comprova merge, execução remota, timer ou ponte instalada. `doctor` sem `--static` também exige a instalação local. Ausência de dependência é erro explícito; o dispatcher não instala pacotes automaticamente.

## Gatilhos e ativação

| Gatilho                                                  | Cadeia real de execução                                                                                                                                                  | Ativação                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR para main / push em main / dispatch                   | `.github/workflows/automation-local.yml` → `doctor --static` → `test` → suites exatas do perfil                                                                          | Workflow versionado; atividade remota depende de publicação/merge e run observado.                                                                                                |
| pre-commit com tooling staged                            | Ponte privada → hook original → `automation.mjs hook pre-commit` → suites registradas                                                                                    | `automation:install-hooks` instala por clone; não é instalado pelo prepare.                                                                                                       |
| pre-push                                                 | Ponte privada → hook original → doctor local → suites registradas                                                                                                        | A mesma instalação local; erro bloqueia a operação.                                                                                                                               |
| Fontes staged / post-commit / post-merge / post-checkout | Ponte privada → hook original → adaptador de grafo marca estado sujo                                                                                                     | Não reconstrói grafo durante commit nem altera staging.                                                                                                                           |
| Noturno local, previsto 04:30                            | Timer do runtime → callback externo `repo-automation-nightly` → `scripts/automation-nightly.sh` → `automation.mjs nightly --ref origin/main` → graph ensure + motor heal | Configuração do timer fica fora do repositório, sob responsabilidade do runtime local. O callback versionado contém o comando real; presença do arquivo não comprova timer ativo. |

A ponte privada fica em `.tools/repo-automation/`; não substitui os arquivos Husky. Preserva erros, argumentos e stdin dos hooks originais, incluindo commit-msg. `prepare`, hooks e guards existentes foram preservados. Para reverter, use `automation:uninstall-hooks`. `nightly.file` aponta para `scripts/automation-nightly.sh`, cuja cadeia é verificada pelo doctor; nenhum arquivo fictício é usado como evidência de agendamento. O runtime deve conferir `systemctl --user status` e a cadeia do callback instalado antes de declarar o timer ativo.

## Suites efetivamente executadas

- `scripts/automation.unit.mjs`
- `scripts/maintenance/maintenance.unit.mjs`
- `scripts/graphify-local.unit.mjs`

As suites usam fixtures descartáveis e não executam os scripts operacionais do inventário. O motor mantém isolamento de rede, validações obrigatórias, escopo e quotas; um gate herdado vermelho bloqueia o patch. Nenhuma referência, tipo gerado, configuração de produção ou regra de negócio é alterada para forçar verde. O grafo usa o perfil específico `graphify.local.json`; seu estado local fica em `.tools/graphify/local-state/`.

## Registro exato dos demais scripts

Os registros `legacy` abaixo preservam ferramentas anteriores e seus chamadores; não são incluídos automaticamente no novo pipeline. Para arquivos TypeScript de apoio sem runner comprovado, o comando listado só valida o inventário; os chamadores originais continuam sendo a referência de execução. Referência literal indica onde o arquivo é citado, sem garantir que esse caminho rode nem autorização para executar operações contra serviços. Sem referência, o arquivo é mantido manual porque função, parâmetros e ambiente precisam de revisão antes de ativar qualquer gatilho. Scripts novos não cobertos por registro fazem `doctor --static` falhar; não existe registro genérico `scripts/**` para ocultá-los.

| Arquivo exato                       | Invocação manual de inventário              | Chamadores literais / justificativa                                                  |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `scripts/gerar-dump-arquitetura.py` | `python3 scripts/gerar-dump-arquitetura.py` | Sem chamador literal; manter manual e revisar parâmetros/ambiente antes de executar. |

## Hooks e workflows anteriores

Hooks inventariados: `(default do Git)` era o hooksPath observado. A tabela registra os arquivos, sem afirmar bootstrap instalado ou execução efetiva em outro clone. O registro legacy desses hooks limita apenas execução arbitrária pelo dispatcher; o Git e a ponte preservam os gatilhos originais.

| Hook exato                          | Gatilho Git original | Referência de inventário                 |
| ----------------------------------- | -------------------- | ---------------------------------------- |
| Nenhum hook versionado inventariado | —                    | A instalação do novo kit é independente. |

Workflows anteriores preservados: 0. Os gatilhos e condições de cada arquivo continuam definidos no YAML original; esta listagem não os promove ao novo pipeline e não executa suas operações.

Os helpers dos corretores anteriores são cobertos por suites de regressão em fixtures; a chamada operacional original continua no respectivo hook/workflow. Os quatro registros principais e helpers ficam explícitos no JSON, sem globs para novos arquivos.
