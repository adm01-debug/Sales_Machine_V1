#!/usr/bin/env python3
"""Gera `.contexto-compartilhado/dump-arquitetura.json` (Guia PromptOps v2.0, sec. 3.3).

Fonte de verdade: `supabase/migrations/*.sql` (aplicadas, em ordem) + `src/routes/**`
+ `src/integrations/**`. NAO consulta o banco ao vivo — usar enquanto a introspeccao
via MCP/Supabase estiver indisponivel; quando houver acesso ao schema real, validar
a saida contra `information_schema` (futuro workflow context-sync.yml).

Uso:  python3 scripts/gerar-dump-arquitetura.py
"""
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"
OUT = ROOT / ".contexto-compartilhado" / "dump-arquitetura.json"

IDENT = r"(?:public\.)?\"?([a-z_][a-z0-9_]*)\"?"


def read_migrations() -> str:
    files = sorted(MIGRATIONS.glob("*.sql"))
    return "\n".join(f.read_text(encoding="utf-8") for f in files)


def balanced_block(text: str, start: int) -> str:
    """Conteudo entre parenteses balanceados a partir de 'start' (posicao do '(')."""
    depth, i = 0, start
    while i < len(text):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return text[start + 1 : i]
        i += 1
    return text[start + 1 :]


def parse_columns(block: str) -> dict:
    cols = {}
    for raw in block.split("\n"):
        line = raw.strip().rstrip(",")
        if not line or line.startswith("--"):
            continue
        first = line.split()[0].upper().strip('"')
        if first in {"PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "CONSTRAINT", "EXCLUDE", "LIKE"}:
            continue
        m = re.match(r"\"?([a-z_][a-z0-9_]*)\"?\s+(.+)$", line, re.IGNORECASE)
        if not m:
            continue
        name, rest = m.group(1), m.group(2).strip()
        tipo = re.split(r"\s+(?:NOT NULL|NULL|DEFAULT|REFERENCES|PRIMARY|UNIQUE|CHECK|COLLATE|CONSTRAINT)", rest, flags=re.IGNORECASE)[0].strip()
        flags = []
        if re.search(r"PRIMARY\s+KEY", rest, re.IGNORECASE):
            flags.append("pk")
        fk = re.search(r"REFERENCES\s+((?:public\.|auth\.)?\"?[a-z_][a-z0-9_]*\"?)", rest, re.IGNORECASE)
        if fk:
            flags.append("fk->" + fk.group(1).replace('"', ""))
        if re.search(r"NOT\s+NULL", rest, re.IGNORECASE):
            flags.append("not null")
        cols[name] = (tipo + (" " + " ".join(flags) if flags else "")).strip()
    return cols



def main() -> None:
    sql = read_migrations()

    # --- tabelas (CREATE TABLE + ALTER TABLE ADD COLUMN) ---
    tabelas: dict[str, dict] = {}
    for m in re.finditer(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?" + IDENT + r"\s*\(", sql, re.IGNORECASE):
        nome = m.group(1)
        block = balanced_block(sql, sql.index("(", m.end() - 1))
        tabelas.setdefault(nome, {"colunas": {}, "rls": False, "indices": [], "triggers": []})
        tabelas[nome]["colunas"].update(parse_columns(block))
    for m in re.finditer(r"ALTER\s+TABLE\s+(?:ONLY\s+)?" + IDENT + r"\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?\"?([a-z_][a-z0-9_]*)\"?\s+([^,;]+)", sql, re.IGNORECASE):
        tbl, col, resto = m.group(1), m.group(2), m.group(3).strip()
        if tbl in tabelas and col not in tabelas[tbl]["colunas"]:
            tabelas[tbl]["colunas"][col] = re.sub(r"\s+", " ", resto)

    # --- RLS ---
    for m in re.finditer(r"ALTER\s+TABLE\s+(?:ONLY\s+)?" + IDENT + r"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY", sql, re.IGNORECASE):
        if m.group(1) in tabelas:
            tabelas[m.group(1)]["rls"] = True

    # --- indices e triggers (nomes por tabela) ---
    for m in re.finditer(r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+" + IDENT, sql, re.IGNORECASE):
        if m.group(2) in tabelas:
            tabelas[m.group(2)]["indices"].append(m.group(1))
    for m in re.finditer(r"CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(\w+)[\s\S]{0,200}?ON\s+" + IDENT, sql, re.IGNORECASE):
        if m.group(2) in tabelas:
            tabelas[m.group(2)]["triggers"].append(m.group(1))
    for t in tabelas.values():
        t["indices"] = sorted(set(t["indices"]))
        t["triggers"] = sorted(set(t["triggers"]))

    # --- enums (CREATE TYPE + ALTER TYPE ADD VALUE) ---
    enums: dict[str, list[str]] = {}
    for m in re.finditer(r"CREATE\s+TYPE\s+" + IDENT + r"\s+AS\s+ENUM\s*\(([^)]*)\)", sql, re.IGNORECASE):
        enums.setdefault(m.group(1), [])
        for v in re.findall(r"'([^']+)'", m.group(2)):
            if v not in enums[m.group(1)]:
                enums[m.group(1)].append(v)
    for m in re.finditer(r"ALTER\s+TYPE\s+" + IDENT + r"\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'", sql, re.IGNORECASE):
        enums.setdefault(m.group(1), [])
        if m.group(2) not in enums[m.group(1)]:
            enums[m.group(1)].append(m.group(2))

    # --- functions ---
    funcs = set()
    for m in re.finditer(r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+" + IDENT + r"\s*\(([^)]{0,120})", sql, re.IGNORECASE):
        args = re.sub(r"\s+", " ", m.group(2)).strip().rstrip(",")
        args = re.sub(r"\bDEFAULT\b.*", "", args, flags=re.IGNORECASE).strip().rstrip(",")
        funcs.add(f"{m.group(1)}({args})")

    # --- cron jobs ---
    crons = [{"nome": n, "schedule": s} for n, s in re.findall(r"cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'", sql)]

    # --- rotas (src/routes) ---
    rotas_api, paginas = [], []
    routes_dir = ROOT / "src" / "routes"
    for f in sorted(routes_dir.rglob("*.*")):
        rel = f.relative_to(routes_dir).as_posix()
        if rel.endswith((".test.ts", ".test.tsx")) or rel == "README.md":
            continue
        if rel.startswith("api/"):
            src = f.read_text(encoding="utf-8")
            metodos = sorted(set(re.findall(r"\b(GET|POST|PUT|PATCH|DELETE)\s*[:(]", src)))
            path = "/" + rel.rsplit(".", 1)[0].replace("[.]", ".").replace("$", ":")
            rotas_api.append({"metodos": metodos or ["GET|POST"], "path": path, "handler": f"src/routes/{rel}"})
        elif f.suffix in {".tsx", ".ts"}:
            paginas.append("/" + rel.rsplit(".", 1)[0])

    # --- integracoes ---
    integracoes = []
    ext = ROOT / "src" / "integrations" / "external"
    if ext.is_dir():
        for f in sorted(ext.glob("*.ts")):
            integracoes.append({"nome": f.stem.replace(".server", ""), "client": f"src/integrations/external/{f.name}"})

    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()

    dump = {
        "atualizado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "commit": commit,
        "fonte": "migrations+src (analise estatica; nao introspeccao do banco ao vivo)",
        "migrations_aplicadas": len(list(MIGRATIONS.glob("*.sql"))),
        "banco": {
            "tabelas": dict(sorted(tabelas.items())),
            "enums": dict(sorted(enums.items())),
            "functions": sorted(funcs),
        },
        "api": {"rotas": rotas_api, "nota": "server routes TanStack Start; webhooks publicos com HMAC-SHA256"},
        "frontend": {"paginas": paginas, "estado_global": ["QueryClient (@tanstack/react-query)"]},
        "integracoes": integracoes,
        "jobs": crons,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(dump, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    json.loads(OUT.read_text(encoding="utf-8"))  # valida round-trip
    print(f"OK -> {OUT} | tabelas={len(tabelas)} enums={len(enums)} functions={len(funcs)} rotas_api={len(rotas_api)} paginas={len(paginas)} crons={len(crons)}")


if __name__ == "__main__":
    main()
