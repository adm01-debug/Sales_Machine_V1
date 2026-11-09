#!/bin/bash
# SessionStart: confere se o indice de contexto (.contexto-compartilhado/dump-arquitetura.json)
# ainda descreve o codigo do commit atual e imprime o resumo que todo agente precisa ter em maos
# antes da primeira tool call. Nao escreve no working tree: a regeneracao de conferencia roda numa
# copia descartavel em $TMPDIR, com links para supabase/ e src/.
# Barato (<2s, Python stdlib). Nao bloqueia a sessao: qualquer falha sai com 0 e silencio.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
DUMP=.contexto-compartilhado/dump-arquitetura.json
[ -f "$DUMP" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

migr=$(ls supabase/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')

tmp=$(mktemp -d 2>/dev/null) || exit 0
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/scripts" "$tmp/.contexto-compartilhado"
cp scripts/gerar-dump-arquitetura.py "$tmp/scripts/" 2>/dev/null || exit 0
ln -s "$PWD/supabase" "$tmp/supabase" 2>/dev/null
ln -s "$PWD/src" "$tmp/src" 2>/dev/null
( cd "$tmp" && python3 scripts/gerar-dump-arquitetura.py >/dev/null 2>&1 ) || exit 0

estado=$(python3 - "$tmp/.contexto-compartilhado/dump-arquitetura.json" "$DUMP" <<'PY'
import json, sys
def carrega(p):
    d = json.load(open(p, encoding="utf-8"))
    d.pop("atualizado_em", None); d.pop("commit", None)
    return d
try:
    novo, commitado = carrega(sys.argv[1]), carrega(sys.argv[2])
except Exception:
    sys.exit(0)
if novo == commitado:
    b = commitado.get("banco", {})
    print("em dia | tabelas=%d enums=%d functions=%d rotas_api=%d jobs=%d" % (
        len(b.get("tabelas", [])), len(b.get("enums", [])), len(b.get("functions", [])),
        len(commitado.get("api", {}).get("rotas", [])), len(commitado.get("jobs", []))))
else:
    print("DESATUALIZADO (Lei 12): rode python3 scripts/gerar-dump-arquitetura.py e commite no mesmo ciclo")
PY
)
[ -n "$estado" ] || exit 0

cat <<TXT
Sales_Machine_V1 — contexto da sessao
- Regras: AGENTS.md (raiz) -> docs/agentes/<tema>.md do que voce vai tocar -> 00-governanca/01-leis-do-agente.md
- Indice de contexto: $estado
- Migrations em supabase/migrations: $migr
- Antes de buscar por texto: .contexto-compartilhado/dump-arquitetura.json; pendencias ja conhecidas em .contexto-compartilhado/pendencias-conhecidas.md
- Envio de mensagem, consentimento, estado de target: docs/agentes/regras-dominio.md (as 10 regras criticas do banco estao no AGENTS.md)
TXT
