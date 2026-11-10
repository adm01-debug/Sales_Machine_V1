# Manutenção local sem IA

Este diretório executa correções determinísticas com ferramentas já instaladas. Não instala dependências, não usa APIs de IA, não publica branches, não atualiza baselines e não corrige regras de negócio.

## Uso

Configure `config.json` com os comandos reais do repositório, seguindo `config.example.json`. Cada comando é um array de argumentos e não passa por shell. Os quatro gates (`lint`, `types`, `test`, `build`) são obrigatórios. O gate `types` usa `typecheck.mjs` com **todos** os projetos listados em `tsconfigs`; um projeto vazio é erro. Use testes finitos, por exemplo `vitest run`, nunca um watcher.

```sh
node scripts/maintenance/run.mjs doctor --root /caminho/projeto
sh scripts/maintenance/run.sh check --root /caminho/projeto --ref main
sh scripts/maintenance/run.sh heal --root /caminho/projeto --ref main
node --test scripts/maintenance/maintenance.unit.mjs
```

`--ref` é obrigatória em `check` e `heal`: pode ser branch local, referência remota já buscada ou SHA. O programa não faz fetch. `--config /caminho/perfil.json` e `--state /diretorio/externo` permitem destinos explícitos. Opções e campos desconhecidos falham.

`doctor` lê o checkout indicado, resolve TypeScript/ESLint/Prettier no `node_modules` desse projeto e comprova ao menos um arquivo de `src` nos tsconfigs usando a API do TypeScript ou, nas distribuições nativas sem API (TypeScript 7), a CLI real com `--listFilesOnly` dentro de namespace de rede isolado. Isso comprova cobertura da configuração, não ausência de erros de tipos. Não executa gates nem corrige arquivos.

`check` e `heal` criam uma worktree descartável do commit resolvido e executam os gates com rede isolada por `unshare --user --map-root-user --net`. A detecção confirma namespace diferente do processo original. Se o sistema não permitir esse isolamento, a rotina bloqueia. Dependências e testes que precisarem de rede devem ser preparados explicitamente fora da rotina; a manutenção não faz fallback para rede real.

## Ciclo de correção

1. Trava global (`run.sh`/flock) e trava atômica por repositório impedem concorrência.
2. A worktree é criada com hooks Git desabilitados. `node_modules` é reutilizado por symlink somente quando manifesto e todos os lockfiles existentes forem idênticos aos do checkout de origem. O relatório registra a origem e os hashes.
3. Arquivos `.env`/`.env.*` rastreados, exceto sufixos `.example`/`.sample`, são movidos para quarentena privada fora da worktree antes de qualquer gate/fixer e restaurados antes de diff/commit. `.env` local não rastreado não é copiado. Filhos recebem somente uma allowlist de variáveis de sistema, `CI=true`, `NODE_ENV=test` e `HUSKY=0`.
4. Os quatro gates rodam **antes** de qualquer correção. Dívida de lint, tipos, testes ou build bloqueia o ciclo como `blocked_baseline`. Nenhum baseline é aumentado para fabricar sucesso.
5. Prettier identifica arquivos diferentes sem editar. ESLint usa configuração isolada com parser do projeto e apenas regras de layout da allowlist; regras do app não são aplicadas silenciosamente. Até 20 arquivos e 400 linhas adicionadas/removidas são selecionados por execução. Arquivos que excederem o orçamento são revertidos individualmente na worktree e listados como pendentes no relatório.
6. Os quatro gates rodam novamente sobre o patch. Alterações feitas pelos gates ao código ou ao índice Git invalidam o resultado. Symlinks em `src`, arquivos binários, alterações fora do escopo e arquivos não rastreados são bloqueantes.
7. O patch validado é salvo fora do repositório e commitado numa branch local `claude/chore-manutencao-YYMMDD-HHMM-uuid`. Os hooks são desabilitados apenas nessa worktree porque os quatro gates completos acabaram de ser executados. Nada é publicado.
8. A worktree própria é removida. Um manifesto externo registra o patch pendente e impede duplicação. A integração é reconhecida por ancestralidade ou árvore resultante de `merge-tree`, inclusive squash; a rotina não remove branches alheias nem publica o patch.

O checkout de edição pode estar sujo: suas alterações de código não são copiadas nem revertidas. Caches das ferramentas podem ser escritos no `node_modules` compartilhado. Um crash do processo pode deixar worktree/trava residual; o próximo executor recupera trava somente de PID inexistente ou criação sem dono com mais de cinco minutos. Trava com dono vivo não é removida. SIGTERM/SIGINT encerram os grupos de subprocessos e a rotina tenta remover sua própria worktree; falha de limpeza nunca é sucesso.

## Relatórios e códigos de saída

Por padrão, relatórios, logs privados e patches ficam em `${XDG_STATE_HOME:-~/.local/state}/repo-maintenance/<hash-do-git-common-dir>/runs/`. Diretórios têm modo 0700; arquivos de relatório/log/patch têm modo 0600. O JSON em stdout contém somente resumo e primeiras mensagens de erro com redação de padrões conhecidos de credenciais. Não há garantia de reconhecer segredos arbitrários que um aplicativo imprima; os logs continuam privados. Nenhum valor de ambiente é registrado pela rotina.

| Estado                    | Exit | Significado                                                  |
| ------------------------- | ---: | ------------------------------------------------------------ |
| `healthy`                 |    0 | Doctor encontrou dependências e cobertura de fonte           |
| `checked`                 |    0 | Quatro gates passaram no commit isolado                      |
| `no_changes`              |    0 | Gates passaram; nenhum patch dentro do orçamento             |
| `validated_patch`         |    0 | Patch e commit local passaram os quatro gates                |
| `missing_dependencies`    |    2 | Ferramenta/instalação ausente ou manifesto/locks divergentes |
| `blocked_baseline`        |    3 | Código original falhou em gate antes da correção             |
| `pending_patch`           |    4 | Existe patch local ainda não integrado                       |
| `blocked_network_sandbox` |    5 | Isolamento real de rede indisponível                         |
| `skipped_busy`            |   75 | Outra execução ou trava recente ocupa o projeto/frota        |
| `failed`                  |    1 | Configuração, correção, gate pós patch ou limpeza falhou     |

As regras ESLint permitidas são `semi`, `quotes`, `indent`, `comma-dangle`, `eol-last`, `no-trailing-spaces`, `space-infix-ops`, `keyword-spacing`, `object-curly-spacing` e `array-bracket-spacing`. A lista vazia aplica somente Prettier. As dependências de parser para TS são exigidas apenas se correções ESLint forem habilitadas. Preserve as convenções do projeto ao selecionar regras para evitar conflito com Prettier.
