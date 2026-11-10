# Manutenção local sem IA

Este diretório executa correções determinísticas com ferramentas já instaladas. Não instala dependências, não usa APIs de IA, não publica branches, não atualiza baselines e não corrige regras de negócio.

## Uso

Configure `config.json` com os comandos reais do repositório, seguindo `config.example.json`. Cada comando é um array de argumentos e não passa por shell. O ambiente de cada gate pode receber `env` explícito apenas com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` de teste: URL local/`.invalid`, sem credenciais/query, e chaves com prefixo sintético `test`, `example`, `fixture`, `local` ou `maintenance` (opcionalmente `sb_publishable_`). Hosts de produção, JWTs, segredos, `NODE_ENV` e outras variáveis são recusados. `VITE_SUPABASE_PROJECT_ID` aceita somente `maintenance_test` ou `test_fixture`. O exemplo de build contém valores fictícios; remova `env` quando desnecessário. Os quatro gates (`lint`, `types`, `test`, `build`) são obrigatórios. O gate `types` usa `typecheck.mjs` com **todos** os projetos listados em `tsconfigs`; um projeto vazio é erro. Use testes finitos, por exemplo `vitest run`, nunca um watcher.

```sh
node scripts/maintenance/run.mjs doctor --root /caminho/projeto
sh scripts/maintenance/run.sh check --root /caminho/projeto --ref main
sh scripts/maintenance/run.sh heal --root /caminho/projeto --ref main
npm run test:maintenance
```

`--ref` é obrigatória em `check` e `heal`: pode ser branch local, referência remota já buscada ou SHA. O programa não faz fetch. `--config /caminho/perfil.json` e `--state /diretorio/externo` permitem destinos explícitos. Opções e campos desconhecidos falham.

`doctor` lê o checkout indicado, resolve TypeScript/ESLint/Prettier no `node_modules` desse projeto e comprova ao menos um arquivo de `src` nos tsconfigs usando a API do TypeScript ou, nas distribuições nativas sem API (TypeScript 7), a CLI real com `--listFilesOnly` dentro de namespace de rede isolado. Isso comprova cobertura da configuração, não ausência de erros de tipos. Não executa gates nem corrige arquivos.

`check` e `heal` criam uma worktree descartável do commit resolvido e executam os gates com rede isolada por `unshare --user --map-root-user --net`. A detecção confirma namespace diferente do processo original. Se o sistema não permitir esse isolamento, a rotina bloqueia. Dependências e testes que precisarem de rede devem ser preparados explicitamente fora da rotina; a manutenção não faz fallback para rede real.

## Ciclo de correção

1. Trava global (`run.sh`/flock) e trava por repositório impedem concorrência. A trava por repositório mantém um `flock` do SO por pipe durante toda a execução, além de PID/token em `owner.json`. Não apague o arquivo `.guard`: sua identidade estável é parte da exclusão de concorrência.
2. A worktree é criada sem executar hooks de checkout. `node_modules` é reutilizado por symlink somente quando manifesto, todos os lockfiles e conteúdos de dependências locais forem idênticos à referência. Diretórios locais `file:`/`link:` e links de `package-lock.json` têm o conteúdo completo comparado; os destinos realmente instalados também são conferidos, inclusive quando `node_modules` vem de outro clone. Vendor sujo/divergente bloqueia antes dos gates. Dependências externas ao repositório, tarballs locais, submódulos, `workspace:` sem resolução explícita e symlinks internos não suportados falham claramente; não há instalação automática. O relatório registra origem e hashes.
3. Arquivos `.env`/`.env.*` rastreados, exceto sufixos `.example`/`.sample`, são movidos para quarentena privada fora da worktree antes de qualquer gate/fixer e restaurados antes de diff/commit. `.env` local não rastreado não é copiado. Filhos recebem somente uma allowlist de variáveis de sistema e `CI=true`; apenas o gate de testes recebe `NODE_ENV=test`, e o build recebe `NODE_ENV=production`. Variáveis públicas de teste vêm exclusivamente de `env` explicitamente configurado no gate; o ambiente privado/produtivo do processo pai não é herdado.
4. Os quatro gates rodam **antes** de qualquer correção. Dívida de lint, tipos, testes ou build bloqueia o ciclo como `blocked_baseline`. Nenhum baseline é aumentado para fabricar sucesso.
5. Prettier identifica arquivos diferentes sem editar; exit 1 só é aceito com uma lista não vazia de caminhos válidos, sem diagnósticos em stdout/stderr. ESLint usa configuração isolada com parser do projeto, `--no-inline-config` e apenas regras de layout da allowlist; diretivas dos fontes não podem habilitar outras regras. Scans usam lotes de até 16 arquivos para respeitar o limite de 4 MB por subprocesso, com orçamento global único. `src/integrations/supabase/types.ts`, fontes marcados com `@generated`/`DO NOT EDIT`/geração automática, arquivos `*.generated.*`/`*.gen.*`, diretórios `generated`/`__generated__`, arquivos de ambiente privados e caminhos de `fix.exclude` nunca são candidatos. `fix.exclude` aceita arquivos ou diretórios relativos explícitos, sem globs. A validação final também rejeita qualquer alteração lateral nesses arquivos. Até 20 arquivos e 400 linhas adicionadas/removidas são selecionados por execução. Arquivos que excederem o orçamento são revertidos individualmente na worktree e listados como pendentes no relatório.
6. Os quatro gates rodam novamente sobre o patch. Alterações feitas pelos gates ao código ou ao índice Git invalidam o resultado. Symlinks em `src`, arquivos binários, alterações fora do escopo e arquivos não rastreados são bloqueantes.
7. O patch validado é salvo fora do repositório e commitado numa branch local `claude/chore-manutencao-YYMMDD-HHMM-uuid`, com mensagem `style(manutencao): aplica correcoes locais verificadas`. Os hooks obrigatórios de commit são executados offline, com ambiente limpo e `.env` em quarentena. Um dispatcher temporário executa os hooks versionados do Husky diretamente com `sh -e`, incluindo `pre-commit` e `commit-msg`, sem depender do bootstrap não versionado `.husky/_` nem alterar o gitconfig do clone. Hooks nativos/customizados configurados também são preservados. Falha de hook bloqueia; se ele mudar índice/árvore/patch, o resultado é rejeitado e a branch própria descartada. Nada é publicado.
8. A worktree própria é removida. Um manifesto externo registra o patch pendente e impede duplicação. A integração é reconhecida por ancestralidade ou árvore resultante de `merge-tree`, inclusive squash; a rotina não remove branches alheias nem publica o patch.

O checkout de edição pode estar sujo: suas alterações de código ou tsconfig não são copiadas nem revertidas. `doctor` inspeciona os tsconfigs desse checkout; `check`/`heal` validam exclusivamente os tsconfigs do commit isolado. A checagem da origem nesses dois comandos se limita à compatibilidade das dependências. Caches das ferramentas podem ser escritos no `node_modules` compartilhado. Um crash do processo pode deixar worktree/trava residual; o próximo executor recupera as travas principal e `.recovery` legada somente de PID inexistente ou criação sem dono com mais de cinco minutos. A aquisição do flock serializa também essa recuperação e se libera automaticamente no crash/fechamento do pipe. Trava com dono vivo não é removida; token divergente impede a limpeza. SIGTERM/SIGINT encerram os grupos de subprocessos e a rotina tenta remover sua própria worktree; falha de limpeza nunca é sucesso.

## Relatórios e códigos de saída

Por padrão, relatórios, logs privados e patches ficam em `${XDG_STATE_HOME:-~/.local/state}/repo-maintenance/<hash-do-git-common-dir>/runs/`. Diretórios têm modo 0700; arquivos de relatório/log/patch têm modo 0600. A coleta usa um decoder UTF-8 incremental por stream, preservando caracteres divididos entre chunks de stdout/stderr, inclusive em patches Git. O JSON em stdout contém somente resumo e primeiras mensagens de erro com redação de padrões conhecidos de credenciais. Não há garantia de reconhecer segredos arbitrários que um aplicativo imprima; os logs continuam privados. Nenhum valor de ambiente é registrado pela rotina.

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
