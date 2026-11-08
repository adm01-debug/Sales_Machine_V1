#!/usr/bin/env bash
# Publica docs/ai-context gerados: commit + push na branch padrão, ou PR quando a branch é protegida.
# Variáveis:
#   BRANCH          branch alvo (default: branch atual)
#   OUT_DIR         pasta gerada (default: docs/ai-context)
#   MODE            push | pr | branch
#                   push   = commit direto na branch padrão (cai para pr se rejeitado e gh existir)
#                   pr     = abre/atualiza uma PR a partir de ai-context/sync
#                   branch = publica em branch derivada BRANCH_OUT (= branch padrão + 1 commit, force-push),
#                            preservando as pastas de outros produtores (KEEP_DIRS) e regenerando o índice (INDEX_CMD).
#                            É o desenho para repos com main protegida e vários produtores numa branch só.
#   BRANCH_OUT      branch derivada (default: contexto)
#   KEEP_DIRS       pastas de outros produtores a preservar na branch derivada, separadas por espaço
#   INDEX_CMD       comando que (re)gera o índice único depois de montar a branch (opcional)
#   PUSH_URL        URL de push com token (CI com persist-credentials: false), ex.: https://x-access-token:$TOKEN@github.com/o/r.git
#   GEN_CMD         comando para regenerar após rebase (default: python3 scripts/ai_context/generate.py --repo . --out $OUT_DIR)
set -euo pipefail
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
OUT_DIR="${OUT_DIR:-docs/ai-context}"
MODE="${MODE:-push}"
GEN_CMD="${GEN_CMD:-python3 scripts/ai_context/generate.py --repo . --out $OUT_DIR}"
PR_BRANCH="ai-context/sync"
MSG="chore(ai-context): atualiza contexto para agentes [skip ci]"

git config user.name "${GIT_USER_NAME:-ai-context-bot}"
git config user.email "${GIT_USER_EMAIL:-ai-context-bot@users.noreply.github.com}"

stage() {
  git add -f -A "$OUT_DIR"   # -f: a saída gerada pode estar no .gitignore da branch padrão (versionada só na branch derivada)
  for f in CLAUDE.md AGENTS.md; do [ -f "$f" ] && git add "$f" || true; done
}

assert_no_foreign_staged_changes() {
  local path
  while IFS= read -r -d '' path; do
    case "$path" in
      "$OUT_DIR"|"$OUT_DIR"/*|CLAUDE.md|AGENTS.md) ;;
      *)
        echo "ERRO: há alteração staged fora da saída gerada: $path. Nada foi publicado." >&2
        return 1
        ;;
    esac
  done < <(git diff --cached --name-only -z)
}

if git check-ignore -q "$OUT_DIR"; then
  echo "ERRO: $OUT_DIR está no .gitignore — os docs nunca seriam commitados. Remova a regra ou mude AI_CONTEXT_OUT."; exit 1
fi
assert_no_foreign_staged_changes
if [ "$MODE" = "branch" ]; then
  # Branch derivada = branch padrão + 1 commit. Nunca toca a branch de origem: trabalha em HEAD destacado.
  BRANCH_OUT="${BRANCH_OUT:-contexto}"
  SRC=$(git rev-parse HEAD)
  SRC_REF=$(git symbolic-ref -q --short HEAD || echo "$SRC")
  trap 'git checkout -q "$SRC_REF" 2>/dev/null || true' EXIT   # sempre volta para a branch de origem, mesmo em erro
  git checkout -q --detach "$SRC"
  stage
  git commit -q -m "$MSG" --allow-empty
  OURS=$(git rev-parse HEAD)
  HAS_OLD=0; git fetch -q origin "$BRANCH_OUT" 2>/dev/null && HAS_OLD=1
  git checkout -q --detach "$SRC"
  if [ "$HAS_OLD" = 1 ]; then
    for d in ${KEEP_DIRS:-}; do git checkout -q "origin/$BRANCH_OUT" -- "$d" 2>/dev/null || true; done   # saídas dos outros produtores
  fi
  git checkout -q "$OURS" -- "$OUT_DIR"                                                            # a nossa saída
  for f in CLAUDE.md AGENTS.md; do git checkout -q "$OURS" -- "$f" 2>/dev/null || true; done
  if [ -n "${INDEX_CMD:-}" ]; then eval "$INDEX_CMD"; git add -A "$(dirname "$OUT_DIR")"; fi
  git add -A "$OUT_DIR" ${KEEP_DIRS:-} 2>/dev/null || git add -A "$OUT_DIR"
  for f in CLAUDE.md AGENTS.md; do [ -f "$f" ] && git add "$f" || true; done
  if [ "$HAS_OLD" = 1 ] && git diff --quiet --cached "origin/$BRANCH_OUT" -- && [ "$(git rev-parse origin/$BRANCH_OUT^ 2>/dev/null)" = "$SRC" ]; then
    echo "branch $BRANCH_OUT já reflete este estado — nada a publicar"; git checkout -q "$SRC_REF" 2>/dev/null || true; exit 0
  fi
  git commit -q -m "$MSG"
  git push -q --force "${PUSH_URL:-origin}" "HEAD:refs/heads/$BRANCH_OUT"
  echo "publicado em $BRANCH_OUT ($(git rev-parse --short HEAD) = $BRANCH + 1 commit)"
  git checkout -q "$SRC_REF" 2>/dev/null || true
  exit 0
fi

stage
if git diff --cached --quiet; then
  echo "docs já atualizados — nada a commitar"; exit 0
fi
git commit -q -m "$MSG"

# O SHA muda no rebase, mas estes metadados de autoria são preservados. Eles
# distinguem o commit gerado do novo topo da origem quando o rebase descarta
# nossa alteração por ela já ter sido aplicada por outro produtor.
remember_generated_head() {
  GENERATED_COMMIT=$(git rev-parse HEAD)
  GENERATED_AUTHOR_EMAIL=$(git show -s --format=%ae HEAD)
  GENERATED_AUTHOR_DATE=$(git show -s --format=%aI HEAD)
}

generated_commit_is_head() {
  [ "$(git show -s --format=%B HEAD)" = "$MSG" ] &&
    [ "$(git show -s --format=%ae HEAD)" = "$GENERATED_AUTHOR_EMAIL" ] &&
    [ "$(git show -s --format=%aI HEAD)" = "$GENERATED_AUTHOR_DATE" ]
}

generated_output_conflict_is_recoverable() {
  local conflicted=0 path
  [ "$(git rev-parse -q --verify REBASE_HEAD 2>/dev/null || true)" = "$GENERATED_COMMIT" ] || return 1
  while IFS= read -r -d '' path; do
    conflicted=1
    case "$path" in
      "$OUT_DIR"|"$OUT_DIR"/*) ;;
      *) return 1 ;;
    esac
  done < <(git diff --name-only --diff-filter=U -z)
  [ "$conflicted" = 1 ]
}

discard_generated_output_commit() {
  local path
  local -a generated_paths=()
  while IFS= read -r -d '' path; do
    case "$path" in "$OUT_DIR"|"$OUT_DIR"/*) generated_paths+=("$path");; esac
  done < <(git diff-tree --no-commit-id --name-only -z -r "$GENERATED_COMMIT")
  git reset -q --mixed "$GENERATED_COMMIT^"
  for path in "${generated_paths[@]}"; do
    if git cat-file -e "HEAD:$path" 2>/dev/null; then
      git restore --source=HEAD --staged --worktree -- "$path"
    else
      rm -f -- "$path"
    fi
  done
}

remember_generated_head

if [ "$MODE" = "push" ]; then
  for attempt in 1 2 3; do
    if git push -q origin "HEAD:$BRANCH" 2>/tmp/push.err; then
      echo "contexto publicado em $(git rev-parse --short HEAD) ($BRANCH)"; exit 0
    fi
    if grep -qiE "protected|GH006|pre-receive|required status|review|rule" /tmp/push.err; then
      echo "push rejeitado por proteção de branch:"; cat /tmp/push.err
      MODE="pr"; break
    fi
    echo "push falhou (tentativa $attempt) — sincronizando com origin/$BRANCH e regenerando"
    git fetch -q origin "$BRANCH"
    # Reaplica somente o commit gerado sobre a origem. --autostash preserva alterações
    # locais rastreadas; arquivos não rastreados permanecem intocados. Nunca use reset
    # destrutivo aqui: este utilitário também pode ser executado fora de um runner efêmero.
    if ! git rebase --autostash "origin/$BRANCH"; then
      if generated_output_conflict_is_recoverable; then
        git rebase --abort >/dev/null 2>&1 || true
        discard_generated_output_commit
        if ! git rebase --autostash "origin/$BRANCH"; then
          git rebase --abort >/dev/null 2>&1 || true
          echo "ERRO: não foi possível preservar os commits locais antes de regenerar." >&2
          exit 1
        fi
      else
        git rebase --abort >/dev/null 2>&1 || true
        echo "ERRO: conflito fora da saída gerada; o checkout local foi preservado." >&2
        exit 1
      fi
    fi
    # Um rebase bem-sucedido troca o SHA do commit sobrevivente mesmo quando a
    # regeneração seguinte não cria diff. Não atualize a identidade se ele foi
    # descartado: nesse caso HEAD pertence à origem ou ao usuário.
    if generated_commit_is_head; then remember_generated_head; fi
    eval "$GEN_CMD --force"
    stage
    if ! git diff --cached --quiet; then
      if generated_commit_is_head; then
        git commit -q --amend --no-edit
      else
        # O rebase pode descartar o commit gerado como patch equivalente. Nesse
        # caso HEAD pertence à origem (ou ao usuário) e jamais deve ser emendado.
        git commit -q -m "$MSG"
      fi
      remember_generated_head
    fi
  done
  if [ "$MODE" != "pr" ]; then
    echo "ERRO: não foi possível publicar após 3 tentativas"; cat /tmp/push.err; exit 1
  fi
fi

# ---- modo PR (branch protegida ou MODE=pr)
if ! command -v gh >/dev/null; then
  echo "ERRO: branch protegida e gh CLI ausente — não há como abrir PR"; exit 1
fi
git push -q --force origin "HEAD:refs/heads/$PR_BRANCH"
if gh pr list --head "$PR_BRANCH" --base "$BRANCH" --state open --json number -q '.[0].number' | grep -q .; then
  echo "PR existente atualizada (branch $PR_BRANCH)"
else
  gh pr create --base "$BRANCH" --head "$PR_BRANCH" --title "chore(ai-context): atualiza contexto para agentes" \
    --body "Atualização automática de \`$OUT_DIR\` pelo AI Context Sync. Mergeie para manter os agentes com contexto atual." >/dev/null
  echo "PR aberta (branch $PR_BRANCH → $BRANCH)"
fi
