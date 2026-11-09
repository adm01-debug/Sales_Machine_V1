#!/usr/bin/env python3
"""
Supabase -> GitHub snapshot (v2).

Introspecta um projeto Supabase (Postgres + Management API) e grava um retrato
completo, determinístico e sem dados pessoais em Markdown/JSON/SQL, pensado
para ser lido por agentes de IA antes de planejar ou executar tarefas.

Garantias:
  * Somente leitura no banco (sessão read-only, statement_timeout, lock_timeout).
  * Nunca grava linhas de tabelas, valores de segredos, chaves, senhas ou DSN.
  * Saída estrutural determinística (ordenada, sem timestamps, sem métricas
    voláteis) -> o git só registra commit quando algo REAL mudou.
    Métricas voláteis (linhas, bytes, scans, contagens, execuções de cron,
    saúde) ficam separadas em stats.md / stats.json / cron-runs.md.
  * Cada seção é isolada: falha em uma não derruba as outras. Uma seção que
    falhou é carregada da coleta anterior (com aviso), nunca registrada como
    "tudo removido" no CHANGELOG.
  * CHANGELOG.md recebe um diff semântico por categoria a cada mudança.

Variáveis de ambiente:
  SUPABASE_DB_URL            (obrigatório) postgres://... (pooler em SESSION mode, ou direta)
  SUPABASE_PROJECT_REF       (opcional)   ref do projeto -> habilita Management API
  SUPABASE_ACCESS_TOKEN      (opcional)   personal access token da Management API
  SNAPSHOT_DIR               (default docs/supabase)
  SNAPSHOT_EXCLUDE_SCHEMAS   schemas extras a ignorar, separados por vírgula
  SNAPSHOT_INCLUDE_SCHEMAS   schemas internos do Supabase a FORÇAR inclusão (ex.: "graphql_public")
  PGDUMP_SCHEMAS             (default "public") schemas do pg_dump --schema-only
  GEN_TYPES                  (default "true") gera types.ts via supabase CLI (npx)
  PGDUMP                     (default "true") gera schema.sql via pg_dump (exige pg_dump >= versão do servidor)
  CRON_RUNS_PER_JOB          (default 3) últimas execuções por job do pg_cron
  STAT_STATEMENTS_TOP        (default 15) consultas mais custosas em stats.md (0 desliga)
  REPO_ROOT                  (default ".") raiz do repo para cruzar funções x código (vazio desliga)
  CODE_SCAN_DIRS             (default src,supabase/functions,supabase/migrations,scripts,...) pastas varridas
  SUPABASE_SNAPSHOT_PUBLICACAO  (default "Gerado automaticamente...") rodapé do índice
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from decimal import Decimal
from typing import Any, Callable

import psycopg
from psycopg.rows import dict_row

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

FORMAT_VERSION = 2
OUTPUT_MARKER = ".supabase-snapshot-output"
OUTPUT_MARKER_CONTENT = f"supabase-snapshot-v{FORMAT_VERSION}\n"
CONFIG_ERRORS: list[str] = []


def env_int(name: str, default: int, minimum: int) -> int:
    raw = os.environ.get(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError:
        CONFIG_ERRORS.append(f"{name} deve ser um inteiro >= {minimum}; recebido {raw!r}")
        return default
    if value < minimum:
        CONFIG_ERRORS.append(f"{name} deve ser >= {minimum}; recebido {value}")
        return default
    return value

DB_URL = os.environ.get("SUPABASE_DB_URL", "").strip()
PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "").strip()
ACCESS_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
OUT = pathlib.Path(os.environ.get("SNAPSHOT_DIR", "docs/supabase")).resolve()
PGDUMP_SCHEMAS = [s.strip() for s in os.environ.get("PGDUMP_SCHEMAS", "public").split(",") if s.strip()]
GEN_TYPES = os.environ.get("GEN_TYPES", "true").lower() in ("1", "true", "yes")
PGDUMP = os.environ.get("PGDUMP", "true").lower() in ("1", "true", "yes")
CRON_RUNS_PER_JOB = env_int("CRON_RUNS_PER_JOB", 3, 0)
STAT_STATEMENTS_TOP = env_int("STAT_STATEMENTS_TOP", 15, 0)
# Raiz do repositório para cruzar "quem chama cada função no código". Vazio = desliga.
REPO_ROOT = pathlib.Path(os.environ.get("REPO_ROOT", ".")).resolve() if os.environ.get("REPO_ROOT", ".") else None
CODE_SCAN_DIRS = [d.strip() for d in os.environ.get("CODE_SCAN_DIRS", "src,supabase/functions,supabase/migrations,scripts,app,lib,server,api").split(",") if d.strip()]
CODE_SCAN_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".py", ".go", ".vue", ".svelte"}
CODE_SCAN_MAX_FILES = env_int("CODE_SCAN_MAX_FILES", 20000, 1)

SYSTEM_SCHEMAS = {"pg_catalog", "information_schema", "pg_toast"}
# Schemas internos do Supabase: cheios de objetos que não são do app. Ficam fora da
# introspecção geral; o que importa deles é coletado em seções dedicadas
# (policies de storage/realtime, triggers em auth/storage, cron, migrations, vault...).
SUPABASE_INTERNAL_SCHEMAS = {
    "auth", "storage", "realtime", "_realtime", "extensions", "graphql", "graphql_public",
    "net", "pgsodium", "pgsodium_masks", "vault", "supabase_functions", "supabase_migrations",
    "cron", "pgbouncer", "pgmq", "pgtle", "repack", "_analytics", "_supavisor", "pg_stat_statements",
}
FORCE_INCLUDE = {s.strip() for s in os.environ.get("SNAPSHOT_INCLUDE_SCHEMAS", "").split(",") if s.strip()}
EXCLUDE_SCHEMAS = (SYSTEM_SCHEMAS | SUPABASE_INTERNAL_SCHEMAS | {
    s.strip() for s in os.environ.get("SNAPSHOT_EXCLUDE_SCHEMAS", "").split(",") if s.strip()
}) - FORCE_INCLUDE

# Roles de sistema do Supabase — grants para elas são ruído.
SYSTEM_ROLES = {
    "postgres", "supabase_admin", "supabase_auth_admin", "supabase_storage_admin",
    "supabase_read_only_user", "supabase_replication_admin", "supabase_realtime_admin",
    "supabase_functions_admin", "supabase_etl_admin", "dashboard_user", "pgbouncer", "pgsodium_keyholder",
    "pgsodium_keyiduser", "pgsodium_keymaker", "pgtle_admin",
}
API_ROLES = ("anon", "authenticated", "service_role", "PUBLIC")

MGMT_API = "https://api.supabase.com/v1"
REDACT_RE = re.compile(
    r"(secret|password|passwd|token|private_key|api_key|apikey|smtp_pass|client_secret|"
    r"signing_key|service_key|anon_key|service_role|jwt|credential|encryption_key|connection_string|dsn)",
    re.I,
)

ERRORS: list[dict[str, str]] = []
CARRIED: list[str] = []  # seções reaproveitadas da coleta anterior por erro


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def log(msg: str) -> None:
    print(f"[snapshot] {msg}", flush=True)


def valid_previous_snapshot(path: pathlib.Path) -> bool:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False
    return (
        isinstance(data, dict)
        and data.get("format_version") == FORMAT_VERSION
        and isinstance(data.get("db"), dict)
        and isinstance(data.get("api"), dict)
    )


def prepare_output_directory() -> None:
    """Recusa alvos amplos ou alheios antes de qualquer coleta/limpeza."""
    cwd = pathlib.Path.cwd().resolve()
    home = pathlib.Path.home().resolve()
    filesystem_root = pathlib.Path(cwd.anchor).resolve()
    if OUT in {filesystem_root, home, cwd} or cwd.is_relative_to(OUT):
        raise ValueError(
            f"SNAPSHOT_DIR inseguro: {OUT}. Use uma subpasta exclusiva fora dos ancestrais do checkout."
        )
    if OUT.exists() and not OUT.is_dir():
        raise ValueError(f"SNAPSHOT_DIR não é um diretório: {OUT}")

    if OUT.exists():
        entries = list(OUT.iterdir())
        marker = OUT / OUTPUT_MARKER
        marker_valid = False
        if marker.is_file():
            try:
                marker_valid = marker.read_text(encoding="utf-8") == OUTPUT_MARKER_CONTENT
            except (OSError, UnicodeError):
                marker_valid = False
        legacy_valid = valid_previous_snapshot(OUT / "snapshot.json")
        if entries and not (marker_valid or legacy_valid):
            raise ValueError(
                f"SNAPSHOT_DIR não vazio e sem marcador/snapshot válido: {OUT}. Nada foi alterado."
            )
    else:
        OUT.mkdir(parents=True)

    (OUT / OUTPUT_MARKER).write_text(OUTPUT_MARKER_CONTENT, encoding="utf-8")


def record_error(section: str, err: Exception | str) -> None:
    text = str(err).strip().splitlines()[0] if str(err).strip() else repr(err)
    ERRORS.append({"section": section, "error": text[:500]})
    log(f"ERRO em {section}: {text[:300]}")


def jsonable(value: Any) -> Any:
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (bytes, memoryview)):
        return bytes(value).hex()
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    return value


def dumps(obj: Any) -> str:
    return json.dumps(jsonable(obj), ensure_ascii=False, indent=2, sort_keys=True, default=str)


def sha(obj: Any) -> str:
    return hashlib.sha256(json.dumps(jsonable(obj), sort_keys=True, default=str).encode()).hexdigest()[:16]


def md_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "sim" if value else "não"
    if isinstance(value, (list, tuple)):
        value = ", ".join(str(v) for v in value)
    return str(value).replace("\r", "").replace("\n", " ").replace("|", "\\|")


def md_table(headers: list[str], rows: list[list[Any]]) -> str:
    if not rows:
        return "_nenhum_\n"
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(md_cell(c) for c in r) + " |")
    return "\n".join(out) + "\n"


def code(v: Any) -> str:
    return f"`{v}`" if v not in (None, "") else ""


def human_bytes(n: Any) -> str:
    try:
        n = float(n)
    except (TypeError, ValueError):
        return ""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} PB"


def approx(n: Any) -> str:
    """Ordem de grandeza estável: ~0, ~1-9, ~12, ~1.2k, ~34k, ~1.5M."""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return ""
    if n < 10:
        return str(n)
    for div, suf in ((1_000_000_000, "B"), (1_000_000, "M"), (1_000, "k")):
        if n >= div:
            return f"~{n / div:.1f}{suf}".replace(".0", "")
    return f"~{round(n, -1)}"


def slug(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", text).strip("_") or "_"


_SLUG_SEEN: dict[str, str] = {}


def uslug(text: str, scope: str = "") -> str:
    """slug único dentro de um escopo: nomes diferentes que colidem no slug ganham sufixo com hash."""
    base = slug(text)
    key = f"{scope}/{base}"
    owner = _SLUG_SEEN.setdefault(key, text)
    return base if owner == text else f"{base}__{sha(text)[:6]}"


def write(path: pathlib.Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content if content.endswith("\n") else content + "\n", encoding="utf-8")


def redact(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: ("[REDACTED]" if REDACT_RE.search(str(k)) else redact(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact(v) for v in obj]
    if isinstance(obj, str):
        return scrub(obj)
    return obj


def excluded_sql(alias: str = "n.nspname", extra: set[str] | None = None) -> str:
    lst = ", ".join("'" + s.replace("'", "''") + "'" for s in sorted(EXCLUDE_SCHEMAS | (extra or set())))
    return f"{alias} NOT IN ({lst})"


def group(rows, keyfn):
    g: dict[Any, list] = {}
    for r in rows or []:
        g.setdefault(keyfn(r), []).append(r)
    return g


# --------------------------------------------------------------------------- #
# Database introspection
# --------------------------------------------------------------------------- #

SCRUB_RULES: list[tuple[re.Pattern, str]] = [
    # JWT (3 partes) — anon/service_role keys do Supabase
    (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}"), "[REDACTED_JWT]"),
    # chaves novas do Supabase
    (re.compile(r"sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}"), "[REDACTED_KEY]"),
    # Authorization: Bearer <token>  /  apikey: <token>
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]{16,}"), r"\1[REDACTED]"),
    # valor precisa parecer token: >= 16 chars, sem espaço, com pelo menos um dígito (evita redigir prosa)
    (re.compile(r"""(?i)((?:apikey|api_key|x-api-key|authorization|token|secret|password|passwd|service_role_key|anon_key)\s*["']?\s*[:=]\s*["']?)(?=[^"'\s,;)}]*\d)[^"'\s,;)}]{16,}"""), r"\1[REDACTED]"),
    # PASSWORD 'x' em DDL de role
    (re.compile(r"(?i)(password\s+)'[^']*'"), r"\1'[REDACTED]'"),
    # DSN com senha
    (re.compile(r"(\w+://[^/\s:@]+:)[^@\s]+(@)"), r"\1[REDACTED]\2"),
    # chaves de provedores comuns
    (re.compile(r"\b(?:sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{10,}|sk_test_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b"), "[REDACTED_KEY]"),
]


def scrub(text: str) -> str:
    """Redige segredos em texto vindo do banco (comandos de cron, corpos de função, migrations, webhooks...)."""
    for rx, rep in SCRUB_RULES:
        text = rx.sub(rep, text)
    return text


def scrub_value(v: Any) -> Any:
    if isinstance(v, str):
        return scrub(v) if len(v) > 7 else v
    if isinstance(v, list):
        return [scrub_value(x) for x in v]
    if isinstance(v, dict):
        return {k: scrub_value(x) for k, x in v.items()}
    return v


def q(conn: psycopg.Connection, sql: str, params: tuple | None = None) -> list[dict]:
    # params=None -> psycopg não interpreta '%' como placeholder (LIKE 'pg_%' funciona sem escapar).
    # Todo texto que sai do banco passa pelo scrub: pg_cron chamando edge function com service_role no
    # header, migration com senha, trigger http_request com apikey — tudo isso existe na prática.
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params or None)
        return [{k: scrub_value(v) for k, v in dict(r).items()} for r in cur.fetchall()]


def has_ext(conn, name: str) -> bool:
    return bool(q(conn, "SELECT 1 FROM pg_extension WHERE extname = %s", (name,)))


def has_table(conn, schema: str, table: str) -> bool:
    return bool(q(conn, "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                        "WHERE n.nspname = %s AND c.relname = %s", (schema, table)))


def section(name: str, volatile: bool = False):
    """Isola falhas por seção. volatile=True -> vai para stats.*, fora do snapshot estrutural."""
    def deco(fn):
        def wrapper(conn):
            try:
                data = fn(conn)
                log(f"{name}: ok ({len(data) if hasattr(data, '__len__') else 1})")
                return data
            except Exception as e:  # noqa: BLE001
                record_error(name, e)
                try:
                    conn.rollback()
                except Exception:  # noqa: BLE001
                    pass
                return None
        wrapper.__name__ = name
        wrapper.volatile = volatile  # type: ignore[attr-defined]
        return wrapper
    return deco


@section("server")
def get_server(conn):
    rows = q(conn, """
        SELECT name, setting FROM pg_settings
        WHERE name IN ('server_version','max_connections','timezone','statement_timeout','idle_in_transaction_session_timeout',
                       'shared_buffers','work_mem','maintenance_work_mem','max_wal_size','log_min_duration_statement',
                       'default_transaction_isolation','wal_level','max_worker_processes','max_parallel_workers')
        ORDER BY name""")
    info = {r["name"]: r["setting"] for r in rows}
    info["database"] = q(conn, "SELECT current_database() AS db")[0]["db"]
    info["exposed_schemas_hint"] = "ver project-config.md (postgrest db_schemas); default: public, graphql_public"
    return info


@section("schemas")
def get_schemas(conn):
    return q(conn, f"""
        SELECT n.nspname AS name, pg_get_userbyid(n.nspowner) AS owner, obj_description(n.oid, 'pg_namespace') AS comment,
               (SELECT string_agg(r.rolname, ', ' ORDER BY r.rolname) FROM pg_roles r
                 WHERE r.rolname IN ('anon','authenticated','service_role') AND has_schema_privilege(r.oid, n.oid, 'USAGE')) AS usage_api_roles
        FROM pg_namespace n
        WHERE {excluded_sql()} AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast%'
        ORDER BY 1""")


@section("tables")
def get_tables(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS name,
               CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned' WHEN 'f' THEN 'foreign' END AS kind,
               c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
               pg_get_userbyid(c.relowner) AS owner, obj_description(c.oid, 'pg_class') AS comment,
               c.relispartition AS is_partition,
               (SELECT pn.nspname || '.' || pc.relname FROM pg_inherits i JOIN pg_class pc ON pc.oid = i.inhparent
                  JOIN pg_namespace pn ON pn.oid = pc.relnamespace WHERE i.inhrelid = c.oid LIMIT 1) AS parent,
               CASE WHEN c.relkind = 'p' THEN pg_get_partkeydef(c.oid) END AS partition_key,
               CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound, c.oid) END AS partition_bound,
               CASE c.relreplident WHEN 'd' THEN 'default' WHEN 'f' THEN 'full' WHEN 'i' THEN 'index' WHEN 'n' THEN 'nothing' END AS replica_identity,
               EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e') AS from_extension
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p','f') AND {excluded_sql()}
        ORDER BY 1, 2""")


@section("columns")
def get_columns(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS "table", a.attnum AS position, a.attname AS name,
               format_type(a.atttypid, a.atttypmod) AS type,
               NOT a.attnotnull AS nullable, pg_get_expr(d.adbin, d.adrelid) AS "default",
               NULLIF(a.attidentity, '') AS identity, NULLIF(a.attgenerated, '') AS generated,
               col_description(c.oid, a.attnum) AS comment,
               (t.typtype = 'e') AS is_enum
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_type t ON t.oid = a.atttypid
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f') AND {excluded_sql()}
        ORDER BY 1, 2, 3""")


@section("constraints")
def get_constraints(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS "table", con.conname AS name,
               CASE con.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY' WHEN 'u' THEN 'UNIQUE'
                    WHEN 'c' THEN 'CHECK' WHEN 'x' THEN 'EXCLUDE' ELSE con.contype::text END AS type,
               pg_get_constraintdef(con.oid, true) AS definition,
               ARRAY(SELECT a.attname FROM unnest(con.conkey) k JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k) AS columns,
               fn.nspname AS ref_schema, fc.relname AS ref_table,
               ARRAY(SELECT a.attname FROM unnest(con.confkey) k JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k) AS ref_columns,
               CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                    WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
               CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                    WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update,
               con.condeferrable AS deferrable, con.convalidated AS validated
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_class fc ON fc.oid = con.confrelid
        LEFT JOIN pg_namespace fn ON fn.oid = fc.relnamespace
        WHERE {excluded_sql()}
        ORDER BY 1, 2, 3""")


@section("indexes")
def get_indexes(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, t.relname AS "table", ic.relname AS name, pg_get_indexdef(ix.indexrelid) AS definition,
               ix.indisunique AS is_unique, ix.indisprimary AS is_primary, ix.indisvalid AS is_valid,
               am.amname AS method,
               ARRAY(SELECT a.attname FROM unnest(ix.indkey) WITH ORDINALITY k(attnum, ord)
                     JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum ORDER BY k.ord) AS columns,
               pg_get_expr(ix.indpred, ix.indrelid) AS predicate
        FROM pg_index ix
        JOIN pg_class ic ON ic.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON am.oid = ic.relam
        WHERE {excluded_sql()}
        ORDER BY 1, 2, 3""")


@section("views")
def get_views(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS name,
               CASE c.relkind WHEN 'v' THEN 'view' ELSE 'materialized' END AS kind,
               pg_get_viewdef(c.oid, true) AS definition,
               c.reloptions AS options, pg_get_userbyid(c.relowner) AS owner,
               obj_description(c.oid, 'pg_class') AS comment,
               CASE WHEN c.relkind = 'm' THEN c.relispopulated END AS populated,
               (c.relkind = 'v' AND coalesce(array_to_string(c.reloptions, ','), '') ILIKE '%security_invoker=true%') AS security_invoker,
               ARRAY(SELECT DISTINCT dn.nspname || '.' || dc.relname
                     FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
                     JOIN pg_class dc ON dc.oid = d.refobjid JOIN pg_namespace dn ON dn.oid = dc.relnamespace
                     WHERE r.ev_class = c.oid AND d.refobjid <> c.oid AND dc.relkind IN ('r','p','v','m','f')
                     ORDER BY 1) AS depends_on
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('v','m') AND {excluded_sql()}
        ORDER BY 1, 2""")


@section("functions")
def get_functions(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, p.proname AS name,
               pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS returns,
               l.lanname AS language,
               CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate' WHEN 'w' THEN 'window' END AS kind,
               p.prosecdef AS security_definer,
               CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable' ELSE 'volatile' END AS volatility,
               p.proconfig AS config, p.proleakproof AS leakproof, p.proisstrict AS strict,
               pg_get_userbyid(p.proowner) AS owner, obj_description(p.oid, 'pg_proc') AS comment,
               CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) END AS definition,
               (SELECT string_agg(r.rolname, ', ' ORDER BY r.rolname) FROM pg_roles r
                 WHERE r.rolname IN ('anon','authenticated','service_role') AND has_function_privilege(r.oid, p.oid, 'EXECUTE')) AS execute_api_roles,
               has_function_privilege('public', p.oid, 'EXECUTE') AS execute_public,
               (p.prorettype = 'trigger'::regtype) AS is_trigger_fn
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE {excluded_sql()}
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
        ORDER BY 1, 2, 3""")


@section("triggers")
def get_triggers(conn):
    # inclui auth e storage: triggers do app em auth.users / storage.objects são críticos.
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS "table", t.tgname AS name,
               CASE t.tgenabled WHEN 'O' THEN 'enabled' WHEN 'D' THEN 'disabled' WHEN 'R' THEN 'replica' WHEN 'A' THEN 'always' END AS status,
               pn.nspname || '.' || p.proname AS function,
               CASE WHEN (t.tgtype & 2) > 0 THEN 'BEFORE' WHEN (t.tgtype & 64) > 0 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
               concat_ws(' OR ', CASE WHEN (t.tgtype & 4) > 0 THEN 'INSERT' END, CASE WHEN (t.tgtype & 8) > 0 THEN 'DELETE' END,
                         CASE WHEN (t.tgtype & 16) > 0 THEN 'UPDATE' END, CASE WHEN (t.tgtype & 32) > 0 THEN 'TRUNCATE' END) AS events,
               CASE WHEN (t.tgtype & 1) > 0 THEN 'ROW' ELSE 'STATEMENT' END AS level,
               pg_get_triggerdef(t.oid, true) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN pg_namespace pn ON pn.oid = p.pronamespace
        WHERE NOT t.tgisinternal AND ({excluded_sql()} OR n.nspname IN ('auth','storage'))
        ORDER BY 1, 2, 3""")


@section("policies")
def get_policies(conn):
    # inclui storage (buckets/objects) e realtime.messages (broadcast/presence authorization)
    return q(conn, f"""
        SELECT schemaname AS schema, tablename AS "table", policyname AS name,
               permissive, roles, cmd, qual AS "using", with_check
        FROM pg_policies
        WHERE {excluded_sql('schemaname')} OR schemaname IN ('storage','realtime')
        ORDER BY 1, 2, 3""")


@section("types")
def get_types(conn):
    enums = q(conn, f"""
        SELECT n.nspname AS schema, t.typname AS name, 'enum' AS kind,
               array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values, NULL AS definition
        FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE {excluded_sql()} GROUP BY 1, 2""")
    domains = q(conn, f"""
        SELECT n.nspname AS schema, t.typname AS name, 'domain' AS kind, NULL AS values,
               format_type(t.typbasetype, t.typtypmod)
                 || COALESCE(' ' || (SELECT string_agg(pg_get_constraintdef(c.oid), ' ') FROM pg_constraint c WHERE c.contypid = t.oid), '') AS definition
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'd' AND {excluded_sql()}""")
    composites = q(conn, f"""
        SELECT n.nspname AS schema, t.typname AS name, 'composite' AS kind, NULL AS values,
               (SELECT string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' ORDER BY a.attnum)
                  FROM pg_attribute a WHERE a.attrelid = t.typrelid AND a.attnum > 0 AND NOT a.attisdropped) AS definition
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_class c ON c.oid = t.typrelid AND c.relkind = 'c'
        WHERE t.typtype = 'c' AND {excluded_sql()}""")
    return sorted(enums + domains + composites, key=lambda r: (r["schema"], r["kind"], r["name"]))


@section("extensions")
def get_extensions(conn):
    return q(conn, """
        SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema,
               (SELECT default_version FROM pg_available_extensions a WHERE a.name = e.extname) AS available_version
        FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY 1""")


@section("sequences")
def get_sequences(conn):
    return q(conn, f"""
        SELECT s.schemaname AS schema, s.sequencename AS name, s.data_type::text AS data_type, s.start_value, s.increment_by AS increment,
               s.cycle,
               (SELECT dn.nspname || '.' || dc.relname || '.' || a.attname
                  FROM pg_depend d JOIN pg_class dc ON dc.oid = d.refobjid JOIN pg_namespace dn ON dn.oid = dc.relnamespace
                  JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
                  JOIN pg_class sc ON sc.oid = d.objid
                 WHERE sc.relname = s.sequencename AND sc.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = s.schemaname)
                   AND d.deptype IN ('a','i') LIMIT 1) AS owned_by
        FROM pg_sequences s WHERE {excluded_sql('s.schemaname')} ORDER BY 1, 2""")


@section("grants")
def get_grants(conn):
    sys_roles = ", ".join("'" + r + "'" for r in sorted(SYSTEM_ROLES))
    tables = q(conn, f"""
        SELECT table_schema AS schema, table_name AS "table", grantee,
               string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
        FROM information_schema.role_table_grants
        WHERE grantee NOT IN ({sys_roles}) AND ({excluded_sql('table_schema')} OR table_schema IN ('storage'))
        GROUP BY 1, 2, 3 ORDER BY 1, 2, 3""")
    columns = q(conn, f"""
        SELECT table_schema AS schema, table_name AS "table", column_name AS "column", grantee,
               string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
        FROM information_schema.column_privileges cp
        WHERE grantee NOT IN ({sys_roles}) AND {excluded_sql('table_schema')}
          AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                          WHERE g.table_schema = cp.table_schema AND g.table_name = cp.table_name
                            AND g.grantee = cp.grantee AND g.privilege_type = cp.privilege_type)
        GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4""")
    sequences = q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS sequence, r.rolname AS grantee,
               concat_ws(', ', CASE WHEN has_sequence_privilege(r.oid, c.oid, 'USAGE') THEN 'USAGE' END,
                               CASE WHEN has_sequence_privilege(r.oid, c.oid, 'SELECT') THEN 'SELECT' END,
                               CASE WHEN has_sequence_privilege(r.oid, c.oid, 'UPDATE') THEN 'UPDATE' END) AS privileges
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN pg_roles r
        WHERE c.relkind = 'S' AND r.rolname IN ('anon','authenticated','service_role') AND {excluded_sql()}
          AND (has_sequence_privilege(r.oid, c.oid, 'USAGE') OR has_sequence_privilege(r.oid, c.oid, 'SELECT') OR has_sequence_privilege(r.oid, c.oid, 'UPDATE'))
        ORDER BY 1, 2, 3""")
    defaults = q(conn, """
        SELECT COALESCE(n.nspname, '(global)') AS schema, pg_get_userbyid(d.defaclrole) AS owner_role,
               CASE d.defaclobjtype WHEN 'r' THEN 'tables' WHEN 'S' THEN 'sequences' WHEN 'f' THEN 'functions'
                    WHEN 'T' THEN 'types' WHEN 'n' THEN 'schemas' END AS object_type,
               d.defaclacl::text[] AS acl
        FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace ORDER BY 1, 2, 3""")
    return {"tables": tables, "columns": columns, "sequences": sequences, "default_privileges": defaults}


@section("roles")
def get_roles(conn):
    return q(conn, """
        SELECT r.rolname AS name, r.rolsuper AS superuser, r.rolinherit AS inherit, r.rolcreaterole AS create_role,
               r.rolcreatedb AS create_db, r.rolcanlogin AS login, r.rolbypassrls AS bypass_rls, r.rolconnlimit AS conn_limit,
               r.rolconfig AS config,
               ARRAY(SELECT b.rolname FROM pg_auth_members m JOIN pg_roles b ON b.oid = m.roleid WHERE m.member = r.oid ORDER BY 1) AS member_of
        FROM pg_roles r WHERE r.rolname NOT LIKE 'pg\\_%' ORDER BY 1""")


@section("realtime")
def get_realtime(conn):
    pubs = q(conn, """
        SELECT p.pubname AS publication, p.puballtables AS all_tables, p.pubinsert AS "insert", p.pubupdate AS "update",
               p.pubdelete AS "delete", p.pubtruncate AS "truncate" FROM pg_publication p ORDER BY 1""")
    tables = q(conn, "SELECT pubname AS publication, schemaname AS schema, tablename AS \"table\" FROM pg_publication_tables ORDER BY 1, 2, 3")
    return {"publications": pubs, "tables": tables}


@section("cron")
def get_cron(conn):
    if not has_ext(conn, "pg_cron"):
        return {"installed": False, "jobs": []}
    return {"installed": True, "jobs": q(conn, """
        SELECT jobid, jobname, schedule, command, database, username, active FROM cron.job ORDER BY jobid""")}


@section("cron_runs", volatile=True)
def get_cron_runs(conn):
    if not has_ext(conn, "pg_cron"):
        return []
    return q(conn, """
        SELECT jobid, runid, status, start_time, end_time,
               EXTRACT(EPOCH FROM (end_time - start_time))::numeric(10,2) AS seconds, left(return_message, 300) AS return_message
        FROM (SELECT *, row_number() OVER (PARTITION BY jobid ORDER BY start_time DESC) AS rn
                FROM cron.job_run_details WHERE start_time > now() - interval '7 days') t
        WHERE rn <= %s ORDER BY jobid, start_time DESC""", (CRON_RUNS_PER_JOB,))


@section("queues")
def get_queues(conn):
    if not has_ext(conn, "pgmq"):
        return {"installed": False, "queues": []}
    return {"installed": True, "queues": q(conn, """
        SELECT queue_name, is_partitioned, is_unlogged, created_at FROM pgmq.list_queues() ORDER BY 1""")}


@section("migrations")
def get_migrations(conn):
    if not has_table(conn, "supabase_migrations", "schema_migrations"):
        return []
    has_name = bool(q(conn, "SELECT 1 FROM information_schema.columns WHERE table_schema = 'supabase_migrations' "
                            "AND table_name = 'schema_migrations' AND column_name = 'name'"))
    return q(conn, f"SELECT version, {'name' if has_name else 'NULL AS name'}, statements FROM supabase_migrations.schema_migrations ORDER BY version")


@section("storage")
def get_storage(conn):
    return q(conn, """
        SELECT id, name, public, file_size_limit, allowed_mime_types, created_at
        FROM storage.buckets ORDER BY id""")


@section("vault")
def get_vault(conn):
    if not has_ext(conn, "supabase_vault"):
        return []
    return q(conn, "SELECT name, description, created_at FROM vault.secrets ORDER BY name")


@section("foreign_servers")
def get_foreign(conn):
    return q(conn, """
        SELECT s.srvname AS name, w.fdwname AS wrapper,
               ARRAY(SELECT regexp_replace(o, '^(password|secret|token|key|api_key|service_key)=.*', '\\1=[REDACTED]', 'i')
                     FROM unnest(s.srvoptions) o) AS options
        FROM pg_foreign_server s JOIN pg_foreign_data_wrapper w ON w.oid = s.srvfdw ORDER BY 1""")


@section("webhooks")
def get_webhooks(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS "table", t.tgname AS name, pg_get_triggerdef(t.oid, true) AS definition
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace pn ON pn.oid = p.pronamespace
        WHERE NOT t.tgisinternal AND pn.nspname = 'supabase_functions' AND p.proname = 'http_request'
          AND ({excluded_sql()} OR n.nspname IN ('auth','storage'))
        ORDER BY 1, 2, 3""")


@section("lints")
def get_lints(conn):
    """Verificações objetivas de segurança/perf que um agente deve conhecer antes de planejar."""
    out: list[dict] = []
    rows = q(conn, """
        SELECT n.nspname AS schema, c.relname AS "table", c.relrowsecurity AS rls,
               (SELECT count(*) FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS policies
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p') AND n.nspname = 'public' AND NOT c.relispartition""")
    for r in rows:
        if not r["rls"]:
            out.append({"severity": "ALTA", "code": "rls_disabled", "object": f"{r['schema']}.{r['table']}",
                        "detail": "Tabela exposta pela API sem RLS: qualquer chave anon lê/escreve tudo."})
        elif r["policies"] == 0:
            out.append({"severity": "MÉDIA", "code": "rls_no_policies", "object": f"{r['schema']}.{r['table']}",
                        "detail": "RLS ligado sem policies: inacessível via API (só service_role)."})
    for r in q(conn, """
        SELECT n.nspname AS schema, c.relname AS "table" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p') AND n.nspname = 'public' AND NOT c.relispartition
          AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p')"""):
        out.append({"severity": "MÉDIA", "code": "no_primary_key", "object": f"{r['schema']}.{r['table']}",
                    "detail": "Sem chave primária: Realtime/replicação e updates por linha ficam frágeis."})
    for r in q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS "table", con.conname,
               ARRAY(SELECT a.attname FROM unnest(con.conkey) k JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k) AS cols
        FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype = 'f' AND {excluded_sql()}
          AND NOT EXISTS (SELECT 1 FROM pg_index ix WHERE ix.indrelid = con.conrelid
                          AND (ix.indkey::int2[])[0:array_length(con.conkey,1)-1] = con.conkey::int2[])"""):
        out.append({"severity": "BAIXA", "code": "fk_without_index", "object": f"{r['schema']}.{r['table']}.{r['conname']}",
                    "detail": f"FK sem índice nas colunas {r['cols']}: joins e DELETE/UPDATE na tabela pai ficam lentos."})
    for r in q(conn, f"""
        SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prosecdef AND {excluded_sql()}
          AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{{}}')) c WHERE c LIKE 'search_path=%')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')"""):
        out.append({"severity": "ALTA", "code": "secdef_mutable_search_path", "object": f"{r['schema']}.{r['name']}({r['args']})",
                    "detail": "SECURITY DEFINER sem `SET search_path`: vulnerável a sequestro de search_path."})
    for r in q(conn, """
        SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'v' AND n.nspname = 'public'
          AND coalesce(array_to_string(c.reloptions, ','), '') NOT ILIKE '%security_invoker=true%'"""):
        out.append({"severity": "ALTA", "code": "view_security_definer", "object": f"{r['schema']}.{r['name']}",
                    "detail": "View em public sem security_invoker: executa como owner e ignora RLS das tabelas base."})
    for r in q(conn, f"""
        SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prorettype <> 'trigger'::regtype AND p.prosecdef
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')"""):
        out.append({"severity": "INFO", "code": "rpc_anon_executable", "object": f"{r['schema']}.{r['name']}({r['args']})",
                    "detail": "SECURITY DEFINER chamável via RPC por anon (sem login): roda com privilégios do owner. Confirme que é intencional (Supabase dá EXECUTE a anon por padrão; revogue se não for API pública)."})
    for r in q(conn, """
        SELECT e.extname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE n.nspname = 'public' AND e.extname NOT IN ('plpgsql')"""):
        out.append({"severity": "BAIXA", "code": "extension_in_public", "object": r["extname"],
                    "detail": "Extensão instalada no schema public (recomendado: schema extensions)."})
    for r in q(conn, f"""
        SELECT schemaname AS schema, tablename AS "table", policyname AS name, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
        FROM pg_policies WHERE {excluded_sql('schemaname')} OR schemaname = 'storage'"""):
        expr = r["expr"]
        if re.search(r"auth\.(uid|jwt|role)\(\)", expr) and not re.search(r"\(\s*select\s+auth\.(uid|jwt|role)\(\)", expr, re.I):
            out.append({"severity": "BAIXA", "code": "policy_auth_fn_not_wrapped", "object": f"{r['schema']}.{r['table']}.{r['name']}",
                        "detail": "Policy chama auth.uid()/jwt() sem `(select ...)`: é reavaliada por linha; envolva em subselect."})
    for r in q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS "table", c.relreplident
        FROM pg_publication_tables pt JOIN pg_class c ON c.relname = pt.tablename
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = pt.schemaname
        WHERE pt.pubname = 'supabase_realtime' AND c.relreplident <> 'f' AND {excluded_sql()}"""):
        out.append({"severity": "INFO", "code": "realtime_replica_identity", "object": f"{r['schema']}.{r['table']}",
                    "detail": "Publicada no Realtime sem REPLICA IDENTITY FULL: eventos de UPDATE/DELETE não trazem `old` completo."})
    return sorted(out, key=lambda x: ({"ALTA": 0, "MÉDIA": 1, "BAIXA": 2, "INFO": 3}[x["severity"]], x["code"], x["object"]))


# ---- voláteis -> stats.* ---------------------------------------------------- #

@section("table_stats", volatile=True)
def get_table_stats(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS name, GREATEST(c.reltuples::bigint, 0) AS est_rows,
               pg_total_relation_size(c.oid) AS total_bytes, pg_relation_size(c.oid) AS heap_bytes,
               pg_indexes_size(c.oid) AS index_bytes,
               s.n_dead_tup AS dead_rows, s.seq_scan, s.idx_scan, s.last_autovacuum, s.last_autoanalyze
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE c.relkind IN ('r','p') AND {excluded_sql()}
        ORDER BY pg_total_relation_size(c.oid) DESC, 1, 2""")


@section("index_stats", volatile=True)
def get_index_stats(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, t.relname AS "table", ic.relname AS name, pg_relation_size(ix.indexrelid) AS bytes,
               COALESCE(s.idx_scan, 0) AS scans, ix.indisunique AS is_unique, ix.indisprimary AS is_primary
        FROM pg_index ix JOIN pg_class ic ON ic.oid = ix.indexrelid JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = ix.indexrelid
        WHERE {excluded_sql()} ORDER BY 1, 2, 3""")


@section("db_stats", volatile=True)
def get_db_stats(conn):
    out: dict[str, Any] = {}
    out["database_bytes"] = q(conn, "SELECT pg_database_size(current_database()) AS s")[0]["s"]
    out["connections"] = q(conn, """
        SELECT usename, state, count(*) AS n FROM pg_stat_activity WHERE datname = current_database()
        GROUP BY 1, 2 ORDER BY 1, 2""")
    out["schema_bytes"] = q(conn, f"""
        SELECT n.nspname AS schema, sum(pg_total_relation_size(c.oid)) AS bytes
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p','m') AND {excluded_sql()} GROUP BY 1 ORDER BY 2 DESC""")
    out["storage"] = q(conn, """
        SELECT bucket_id, count(*) AS objects, COALESCE(sum((metadata->>'size')::bigint), 0) AS bytes
        FROM storage.objects GROUP BY 1 ORDER BY 1""")
    # Role sem SELECT em auth.* (ex.: role de leitura do workflow) nao pode derrubar a secao inteira:
    # em producao isso apagava tamanho do banco, conexoes, storage e filas de stats.md.
    try:
        out["auth"] = {
            "users_total": q(conn, "SELECT count(*) AS c FROM auth.users")[0]["c"],
            "users_confirmed": q(conn, "SELECT count(*) AS c FROM auth.users WHERE email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL")[0]["c"],
            "users_last_30d": q(conn, "SELECT count(*) AS c FROM auth.users WHERE created_at > now() - interval '30 days'")[0]["c"],
            "identities_by_provider": q(conn, "SELECT provider, count(*) AS users FROM auth.identities GROUP BY 1 ORDER BY 1"),
            "mfa_factors": q(conn, "SELECT factor_type, status, count(*) AS total FROM auth.mfa_factors GROUP BY 1, 2 ORDER BY 1, 2"),
        }
    except Exception as e:  # noqa: BLE001
        record_error("db_stats.auth", e)
        out["auth"] = {}
    out["queues"] = q(conn, "SELECT queue_name, queue_length, newest_msg_age_sec, oldest_msg_age_sec, total_messages FROM pgmq.metrics_all() ORDER BY 1") if has_ext(conn, "pgmq") else []
    if STAT_STATEMENTS_TOP > 0:
        try:
            extension = q(conn, """
                SELECT n.nspname AS schema FROM pg_catalog.pg_extension e
                JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
                WHERE e.extname = 'pg_stat_statements'""")
            if extension:
                # A extensão pode estar fora do search_path. Delimitar/escapar o
                # identificador preserva schemas com aspas, espaços ou palavras SQL.
                schema = '"' + extension[0]["schema"].replace('"', '""') + '"'
                # TOP já é int na configuração. Sem binds, '%' no identificador
                # não é interpretado pelo psycopg como placeholder.
                top_queries = q(conn, f"""
                    SELECT r.rolname AS role, calls, round(total_exec_time::numeric, 0) AS total_ms, round(mean_exec_time::numeric, 2) AS mean_ms,
                           rows, left(regexp_replace(query, '\\s+', ' ', 'g'), 220) AS query
                    FROM {schema}.pg_stat_statements s JOIN pg_roles r ON r.oid = s.userid
                    WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
                      AND r.rolname NOT IN ('supabase_admin','supabase_auth_admin','supabase_storage_admin','supabase_replication_admin')
                      AND query NOT ILIKE '%pg_stat_statements%'
                      AND query ~* '^\\s*(select|with|insert|update|delete|merge)\\y'   -- utilitários (CREATE ROLE ... PASSWORD) não são normalizados
                    ORDER BY total_exec_time DESC LIMIT {STAT_STATEMENTS_TOP}""")
                for row in top_queries:
                    row["query"] = re.sub(r"'(?:[^']|'')*'", "'?'", row["query"])  # literais que escaparam da normalização
                out["top_queries"] = top_queries
        except Exception as e:  # noqa: BLE001
            record_error("db_stats.top_queries", e)
    return out


DB_SECTIONS: list[Callable] = [
    get_server, get_schemas, get_tables, get_columns, get_constraints, get_indexes, get_views, get_functions,
    get_triggers, get_policies, get_types, get_extensions, get_sequences, get_grants, get_roles, get_realtime,
    get_cron, get_queues, get_migrations, get_storage, get_vault, get_foreign, get_webhooks, get_lints,
    get_cron_runs, get_table_stats, get_index_stats, get_db_stats,
]


def introspect_db(previous_db: dict | None) -> tuple[dict[str, Any], dict[str, Any]]:
    db: dict[str, Any] = {}
    stats: dict[str, Any] = {}
    # prepare_threshold=None: compatível com pooler em transaction mode (sem prepared statements).
    with psycopg.connect(DB_URL, connect_timeout=30, application_name="supabase-snapshot",
                         prepare_threshold=None, autocommit=True) as conn:
        conn.execute("SET default_transaction_read_only = on")
        conn.execute("SET statement_timeout = '90s'")
        conn.execute("SET lock_timeout = '5s'")
        for fn in DB_SECTIONS:
            data = fn(conn)
            if getattr(fn, "volatile", False):
                stats[fn.__name__] = data
            elif data is None and previous_db and previous_db.get(fn.__name__) is not None:
                db[fn.__name__] = previous_db[fn.__name__]
                CARRIED.append(fn.__name__)
                log(f"{fn.__name__}: reaproveitado da coleta anterior")
            else:
                db[fn.__name__] = data
    return db, stats


# --------------------------------------------------------------------------- #
# Management API
# --------------------------------------------------------------------------- #

def api(path: str) -> Any:
    req = urllib.request.Request(f"{MGMT_API}{path}", headers={"Authorization": f"Bearer {ACCESS_TOKEN}", "User-Agent": "supabase-snapshot/2"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
        return json.loads(body.decode("utf-8")) if body else None


def api_section(name: str, path: str, transform=lambda x: x, optional: bool = False):
    try:
        data = transform(api(path))
        log(f"api {name}: ok")
        return data
    except urllib.error.HTTPError as e:
        if optional and e.code in (403, 404):
            log(f"api {name}: indisponível ({e.code}), ignorado")
            return None
        record_error(f"api.{name}", f"HTTP {e.code} em {path}")
    except Exception as e:  # noqa: BLE001
        record_error(f"api.{name}", e)
    return None


def introspect_api(previous_api: dict | None) -> tuple[dict[str, Any], dict[str, Any]]:
    if not (PROJECT_REF and ACCESS_TOKEN):
        log("Management API: SUPABASE_PROJECT_REF/SUPABASE_ACCESS_TOKEN ausentes — pulando edge functions e configs")
        return {"enabled": False}, {}

    ref = PROJECT_REF
    out: dict[str, Any] = {"enabled": True, "ref": ref, "url": f"https://{ref}.supabase.co"}
    stats: dict[str, Any] = {}

    def keep(d, keys):
        return {k: d.get(k) for k in keys} if isinstance(d, dict) else d

    out["project"] = api_section("project", f"/projects/{ref}", lambda p: keep(p, ("id", "name", "region", "status", "created_at", "organization_id")))
    out["edge_functions"] = api_section("edge_functions", f"/projects/{ref}/functions", lambda fs: sorted(
        [keep(f, ("slug", "name", "status", "version", "verify_jwt", "import_map", "entrypoint_path", "import_map_path", "created_at", "updated_at")) for f in fs],
        key=lambda f: f["slug"] or "")) or []
    out["secrets_names"] = api_section("secrets", f"/projects/{ref}/secrets", lambda s: sorted(x.get("name") for x in s if isinstance(x, dict)))
    out["auth_config"] = api_section("auth_config", f"/projects/{ref}/config/auth", redact)
    out["postgrest_config"] = api_section("postgrest_config", f"/projects/{ref}/postgrest", redact)
    out["postgres_config"] = api_section("postgres_config", f"/projects/{ref}/config/database/postgres", redact, optional=True)
    out["pooler_config"] = api_section("pooler_config", f"/projects/{ref}/config/database/pooler", redact)
    out["storage_config"] = api_section("storage_config", f"/projects/{ref}/config/storage", redact, optional=True)
    out["network_restrictions"] = api_section("network_restrictions", f"/projects/{ref}/network-restrictions", redact, optional=True)
    out["ssl_enforcement"] = api_section("ssl_enforcement", f"/projects/{ref}/ssl-enforcement", redact, optional=True)
    out["custom_hostname"] = api_section("custom_hostname", f"/projects/{ref}/custom-hostname", redact, optional=True)
    out["branches"] = api_section("branches", f"/projects/{ref}/branches",
                                  lambda bs: [keep(b, ("id", "name", "git_branch", "status", "is_default", "persistent")) for b in bs], optional=True)
    backups = api_section("backups", f"/projects/{ref}/database/backups", redact, optional=True)
    out["backups_config"] = keep(backups, ("region", "pitr_enabled", "walg_enabled")) if isinstance(backups, dict) else None
    stats["backups"] = backups
    stats["health"] = api_section("health", f"/projects/{ref}/health?services=auth,db,pooler,realtime,rest,storage", redact, optional=True)

    # Edge functions: a API devolve bundle binário (eszip), não fonte. Guardamos só metadados por função;
    # o fonte canônico é supabase/functions/<slug>/ no repo.
    fn_dir = OUT / "edge-functions"
    current = set()
    for f in out["edge_functions"]:
        s = f["slug"]
        current.add(s)
        md = [f"# Edge Function `{s}`\n", md_table(["campo", "valor"], [
            ["nome", f.get("name")], ["status", f.get("status")], ["versão", f.get("version")],
            ["verify_jwt", f.get("verify_jwt")], ["entrypoint", f.get("entrypoint_path")], ["import_map", f.get("import_map_path")],
            ["URL", f"https://{ref}.supabase.co/functions/v1/{s}"], ["fonte no repo", f"`supabase/functions/{s}/`"]])]
        write(fn_dir / slug(s) / "README.md", "\n".join(md))
    if fn_dir.exists():
        for d in fn_dir.iterdir():
            if d.is_dir() and d.name not in {slug(s) for s in current}:
                shutil.rmtree(d)
    return out, stats


# --------------------------------------------------------------------------- #
# pg_dump + types
# --------------------------------------------------------------------------- #

def run_pg_dump() -> str | None:
    if not PGDUMP:
        return None
    if not shutil.which("pg_dump"):
        record_error("pg_dump", "pg_dump não encontrado no PATH")
        return None
    cmd = ["pg_dump", "--schema-only", "--no-owner", "--no-privileges", "--no-tablespaces", "--no-publications",
           "--no-subscriptions", "--no-comments", "--no-security-labels"]
    for s in PGDUMP_SCHEMAS:
        cmd += ["--schema", s]
    cmd += [DB_URL]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=600, check=False)
    except Exception as e:  # noqa: BLE001
        record_error("pg_dump", e)
        return None
    if res.returncode != 0:
        record_error("pg_dump", res.stderr.strip() or f"exit {res.returncode}")
        return None
    lines = [ln for ln in res.stdout.splitlines()
             if not ln.startswith(("-- Dumped from", "-- Dumped by", "\\restrict", "\\unrestrict"))]
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines))
    log(f"pg_dump: ok ({len(text)} bytes)")
    return text


def run_gen_types() -> str | None:
    if not GEN_TYPES:
        return None
    if not shutil.which("npx"):
        record_error("gen_types", "npx não encontrado (Node ausente) — types.ts não gerado")
        return None
    cmd = ["npx", "--yes", "supabase@2", "gen", "types", "typescript", "--db-url", DB_URL, "--schema", "public"]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=600, check=False)
    except Exception as e:  # noqa: BLE001
        record_error("gen_types", e)
        return None
    if res.returncode != 0 or not res.stdout.strip():
        record_error("gen_types", res.stderr.strip()[:500] or f"exit {res.returncode}")
        return None
    log("gen_types: ok")
    return res.stdout


# --------------------------------------------------------------------------- #
# Quem chama cada função (código do repo, cron, triggers, outras funções)
# --------------------------------------------------------------------------- #

def is_caller_source(path: pathlib.Path) -> bool:
    """Histórico, testes e fixtures não demonstram uso atual pela aplicação."""
    excluded = {"_foreign", "_superseded", "test", "tests", "__tests__", "fixtures", "__fixtures__",
                "mocks", "__mocks__", "e2e", "cypress", "playwright"}
    return not (any(part in excluded for part in path.parts[:-1])
                or re.search(r"(?:^test_|_test$|(?:^|\.)(?:test|spec|unit|stories)$)", path.stem))


def sql_without_routine_declarations(text: str) -> str:
    """Ignora nomes em assinaturas DDL sem apagar chamadas no corpo de CREATE FUNCTION."""
    identifier = r'(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)'
    qualified = rf'(?:{identifier}\s*\.\s*)?{identifier}'
    create = re.compile(r'\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|AGGREGATE)\s+'
                        rf'{qualified}(?=\s*\()', re.I)
    signature = rf'{qualified}\s*\((?:[^()]|\([^()]*\))*\)'
    metadata = re.compile(r'\b(?:(?:ALTER|DROP)\s+(?:FUNCTION|PROCEDURE|ROUTINE|AGGREGATE)\b|'
                          r'COMMENT\s+ON\s+(?:FUNCTION|PROCEDURE|ROUTINE|AGGREGATE)\b|'
                          r'(?:GRANT|REVOKE)\s+(?:EXECUTE|ALL(?:\s+PRIVILEGES)?)\s+ON\s+'
                          r'(?:FUNCTION|PROCEDURE|ROUTINE)\b)\s+(?:IF\s+EXISTS\s+)?'
                          rf'{signature}(?:\s*,\s*{signature})*', re.I)
    text = create.sub(lambda m: " " * len(m.group()), text)
    return metadata.sub(lambda m: " " * len(m.group()), text)


def scan_code_files() -> list[tuple[str, str]] | None:
    """Lê arquivos do repo elegíveis como callers (caminho relativo, conteúdo)."""
    if not REPO_ROOT:
        return None
    if not REPO_ROOT.exists():
        record_error("callers.code", "REPO_ROOT não encontrado; referências de código não atualizadas")
        return None
    out: list[tuple[str, str]] = []
    seen: set[pathlib.Path] = set()
    failed = False
    skip = {"node_modules", ".git", "dist", "build", ".next", "coverage", "graphify-out"}
    for d in CODE_SCAN_DIRS:
        base = REPO_ROOT / d
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if len(out) >= CODE_SCAN_MAX_FILES:
                break
            relative = path.relative_to(REPO_ROOT)
            if (relative in seen or not path.is_file() or path.suffix not in CODE_SCAN_EXT or any(part in skip for part in relative.parts)
                    or not is_caller_source(relative)):
                continue
            try:
                if path.stat().st_size > 2_000_000:
                    continue
                out.append((relative.as_posix(), path.read_text(encoding="utf-8", errors="ignore")))
                seen.add(relative)
            except OSError as error:
                record_error("callers.code", f"Não foi possível ler {relative.as_posix()}: {error}")
                failed = True
    return None if failed else out


def rx_name_keys(names: list[str]) -> set[str]:
    return set(names)


def build_function_callers(db: dict) -> dict[str, str]:
    """Atualiza cada categoria disponível e informa a origem atual/anterior das referências."""
    fns = db.get("functions") or []
    if not fns:
        return {}
    if "functions" in CARRIED:
        # introspect_db reutiliza a lista anterior; não altere a base do changelog.
        fns = [{**f} for f in fns]
        db["functions"] = fns
    names = sorted({f["name"] for f in fns}, key=len, reverse=True)
    alt = "|".join(re.escape(n) for n in names)
    schemas = "|".join(re.escape(x) for x in sorted({f["schema"] for f in fns} | {"public"}))
    # Em código (ts/js/...): só `.rpc('nome')` ou `schema.nome(` — `nome(` solto seria qualquer função JS.
    # Em SQL/Python: também `nome(` solto (evita que uma função chamada `count` case com `.count(` do JS).
    rx_code = re.compile(r"""\.rpc\(\s*['"`](?P<rpc>%s)['"`]|(?<![A-Za-z0-9_.])(?:%s)\.(?P<call>%s)\s*\(""" % (alt, schemas, alt))
    rx_sql = re.compile(r"""(?<![A-Za-z0-9_.])(?:(?:%s)\.)?(?P<call>%s)\s*\(""" % (schemas, alt), re.I)
    code_hits: dict[str, dict[str, int]] = {}
    code_files = scan_code_files()
    for rel, text in code_files or []:
        if rel.endswith(".sql"):
            text = sql_without_routine_declarations(text)
        rx = rx_sql if rel.endswith((".sql", ".py")) else rx_code
        for m in rx.finditer(text):
            n = (m.groupdict().get("rpc") or m.group("call"))
            if n not in rx_name_keys(names):
                n = next((k for k in names if k.lower() == n.lower()), n)
            code_hits.setdefault(n, {})
            code_hits[n][rel] = code_hits[n].get(rel, 0) + 1
    cron_jobs = ((db.get("cron") or {}).get("jobs")) or []
    trigs = db.get("triggers") or []
    rx_name = {n: re.compile(r"(?<![A-Za-z0-9_])%s\s*\(" % re.escape(n)) for n in names}
    # Limpa cada definição uma vez, preservando DEFAULTs, antes de cruzá-la com os nomes procurados.
    function_sources = [(g, sql_without_routine_declarations(g["definition"])) for g in fns if g.get("definition")]
    unavailable = {name for name in ("cron", "triggers", "views") if name in CARRIED or db.get(name) is None}
    states = {"code": "coleta atual" if code_files is not None else "indisponível; referências anteriores quando disponíveis"}
    for name in ("cron", "triggers", "views"):
        states[name] = ("coleta anterior" if name in CARRIED else
                        "indisponível; referências anteriores quando disponíveis" if db.get(name) is None else "coleta atual")
    states["db"] = "coleta anterior; corpos SQL não atualizados" if "functions" in CARRIED else "coleta atual"
    for f in fns:
        n = f["name"]
        code = sorted(code_hits.get(n, {}).items())
        previous = f.get("callers") or {}
        callers = {
            "code": [{"file": rel, "hits": c} for rel, c in code[:30]],
            "code_total_files": len(code),
            "cron": [f"{j['jobid']}:{j.get('jobname') or ''}" for j in cron_jobs if rx_name[n].search(j.get("command") or "")],
            "triggers": [f"{t['schema']}.{t['table']}.{t['name']}" for t in trigs if t["function"] == f"{f['schema']}.{n}"],
            # Ignora overloads do mesmo nome; DEFAULTs da assinatura também podem chamar funções.
            "db": sorted({f"{g['schema']}.{g['name']}" for g, definition in function_sources
                          if g["name"] != n and rx_name[n].search(definition)}),
            "views": sorted({f"{v['schema']}.{v['name']}" for v in (db.get("views") or []) if rx_name[n].search(v.get("definition") or "")}),
        }
        # O snapshot compacto não tem corpos SQL: só a categoria db depende deles.
        for name in unavailable | ({"db"} if "functions" in CARRIED else set()):
            if name in previous:
                callers[name] = previous[name]
        if code_files is None:
            callers["code"] = previous.get("code", [])
            callers["code_total_files"] = previous.get("code_total_files", len(callers["code"]))
        f["callers"] = callers
    log(f"callers: código cruzado em {len(code_hits)} funções referenciadas")
    return states


# --------------------------------------------------------------------------- #
# Fingerprints / changelog
# --------------------------------------------------------------------------- #

def fingerprints(snap: dict[str, Any]) -> dict[str, dict[str, str]]:
    db = snap.get("db", {}) or {}
    api_ = snap.get("api", {}) or {}
    fp: dict[str, dict[str, str]] = {}

    def add(cat: str, rows, keyfn, strip: tuple = ()):
        fp[cat] = {keyfn(r): sha({k: v for k, v in r.items() if k not in strip}) for r in (rows or [])}

    add("tabelas", db.get("tables"), lambda r: f"{r['schema']}.{r['name']}")
    add("colunas", db.get("columns"), lambda r: f"{r['schema']}.{r['table']}.{r['name']}")
    add("constraints", db.get("constraints"), lambda r: f"{r['schema']}.{r['table']}.{r['name']}")
    add("indexes", db.get("indexes"), lambda r: f"{r['schema']}.{r['name']}")
    add("views", db.get("views"), lambda r: f"{r['schema']}.{r['name']}")
    add("functions", [{**r, "definition": None, "definition_sha": r.get("definition_sha") or (sha(r["definition"]) if r.get("definition") else None)}
                      for r in (db.get("functions") or [])], lambda r: f"{r['schema']}.{r['name']}({r['args']})")
    add("triggers", db.get("triggers"), lambda r: f"{r['schema']}.{r['table']}.{r['name']}")
    add("policies (RLS)", db.get("policies"), lambda r: f"{r['schema']}.{r['table']}.{r['name']}")
    add("types/enums", db.get("types"), lambda r: f"{r['schema']}.{r['name']}")
    add("extensions", db.get("extensions"), lambda r: r["name"])
    g = db.get("grants") or {}
    add("grants", g.get("tables"), lambda r: f"{r['schema']}.{r['table']}:{r['grantee']}")
    add("roles", db.get("roles"), lambda r: r["name"])
    add("cron jobs", (db.get("cron") or {}).get("jobs"), lambda r: f"{r['jobid']}:{r.get('jobname') or ''}")
    add("queues (pgmq)", (db.get("queues") or {}).get("queues"), lambda r: r["queue_name"])
    add("migrations", [{"version": r["version"], "name": r.get("name"),
                        "statements_sha": r.get("statements_sha") or (sha(r["statements"]) if r.get("statements") else None)}
                       for r in (db.get("migrations") or [])], lambda r: f"{r['version']}_{r.get('name') or ''}")
    add("storage buckets", db.get("storage"), lambda r: r["id"])
    add("edge functions", api_.get("edge_functions"), lambda r: r["slug"], strip=("updated_at",))
    add("vault secrets (nomes)", db.get("vault"), lambda r: r["name"])
    add("webhooks", db.get("webhooks"), lambda r: f"{r['schema']}.{r['table']}.{r['name']}")
    add("realtime", (db.get("realtime") or {}).get("tables"), lambda r: f"{r['publication']}:{r['schema']}.{r['table']}")
    add("lints", db.get("lints"), lambda r: f"{r['code']}:{r['object']}")
    for key in ("auth_config", "postgrest_config", "pooler_config", "postgres_config", "storage_config", "network_restrictions"):
        fp[f"config: {key}"] = {key: sha(api_.get(key))} if api_.get(key) is not None else {}
    return fp


def diff_fingerprints(old: dict, new: dict) -> list[tuple[str, str, list[str]]]:
    out = []
    for cat in sorted(set(old) | set(new)):
        o, n = old.get(cat, {}), new.get(cat, {})
        added, removed = sorted(set(n) - set(o)), sorted(set(o) - set(n))
        changed = sorted(k for k in set(o) & set(n) if o[k] != n[k])
        for kind, keys in (("adicionado", added), ("removido", removed), ("alterado", changed)):
            if keys:
                out.append((cat, kind, keys))
    return out


# --------------------------------------------------------------------------- #
# Renderers
# --------------------------------------------------------------------------- #

def banner(name: str) -> str:
    if name in CARRIED:
        return f"> ⚠️ Seção `{name}` não pôde ser atualizada nesta coleta (ver errors.md); mostrando a versão anterior.\n\n"
    if any(e["section"] == name for e in ERRORS):
        return f"> ⚠️ Seção `{name}` indisponível nesta coleta e sem versão anterior (ver errors.md).\n\n"
    return ""


def callers_status_table(states: dict[str, str] | None) -> str:
    if not states:
        return ""
    labels = {"code": "código do repo", "cron": "cron", "triggers": "triggers", "views": "views", "db": "outras funções"}
    return ("## Estado das fontes do mapa de referências\n\n"
            "Cada fonte é atualizada independentemente; referências anteriores não comprovam uso atual.\n\n"
            + md_table(["fonte", "estado"], [[labels.get(name, name), state] for name, state in states.items()]) + "\n")


def render_tables(db: dict) -> None:
    tables = db.get("tables") or []
    cols = group(db.get("columns"), lambda r: (r["schema"], r["table"]))
    cons = group(db.get("constraints"), lambda r: (r["schema"], r["table"]))
    idx = group(db.get("indexes"), lambda r: (r["schema"], r["table"]))
    pol = group(db.get("policies"), lambda r: (r["schema"], r["table"]))
    trg = group(db.get("triggers"), lambda r: (r["schema"], r["table"]))
    grants = group((db.get("grants") or {}).get("tables"), lambda r: (r["schema"], r["table"]))
    colgrants = group((db.get("grants") or {}).get("columns"), lambda r: (r["schema"], r["table"]))
    fks_in = group([c for c in (db.get("constraints") or []) if c["type"] == "FOREIGN KEY"], lambda r: (r["ref_schema"], r["ref_table"]))
    rt = {(t["schema"], t["table"]) for t in ((db.get("realtime") or {}).get("tables") or [])}
    view_deps = group(db.get("views"), lambda v: None)  # placeholder
    used_by_views: dict[tuple, list[str]] = {}
    for v in db.get("views") or []:
        for dep in v.get("depends_on") or []:
            s, _, t = dep.partition(".")
            used_by_views.setdefault((s, t), []).append(f"{v['schema']}.{v['name']}")
    del view_deps

    index_rows = []
    for t in tables:
        key = (t["schema"], t["name"])
        rel = f"tables/{slug(t['schema'])}/{uslug(t['name'], 'tables/' + t['schema'])}.md"
        index_rows.append([f"[{t['schema']}.{t['name']}]({rel})", t["kind"] + (" (partição)" if t["is_partition"] else ""),
                           t["rls_enabled"], len(pol.get(key, [])), len(cols.get(key, [])), key in rt, t.get("comment")])
        md = [f"# {t['schema']}.{t['name']}\n"]
        if t.get("comment"):
            md.append(f"> {t['comment']}\n")
        props = [["tipo", t["kind"]], ["owner", t["owner"]], ["RLS habilitado", t["rls_enabled"]], ["RLS forçado (owner)", t["rls_forced"]],
                 ["policies", len(pol.get(key, []))], ["realtime (publication)", key in rt], ["replica identity", t["replica_identity"]],
                 ["vem de extensão", t["from_extension"]]]
        if t["partition_key"]:
            props.append(["chave de partição", code(t["partition_key"])])
        if t["is_partition"]:
            props += [["partição de", t["parent"]], ["bound", code(t["partition_bound"])]]
        if used_by_views.get(key):
            props.append(["usada por views", ", ".join(sorted(used_by_views[key]))])
        md.append(md_table(["propriedade", "valor"], props))
        md.append("\n## Colunas\n")
        md.append(md_table(["#", "coluna", "tipo", "nullable", "default", "identity/generated", "comentário"], [
            [c["position"], code(c["name"]), code(c["type"]), c["nullable"], code(c["default"]),
             c.get("identity") or c.get("generated") or "", c.get("comment")] for c in cols.get(key, [])]))
        md.append("\n## Constraints\n")
        md.append(md_table(["nome", "tipo", "definição", "on delete", "on update", "validada"],
                           [[c["name"], c["type"], code(c["definition"]), c["on_delete"] or "", c["on_update"] or "", c["validated"]] for c in cons.get(key, [])]))
        if fks_in.get(key):
            md.append("\n## Referenciada por (FKs de outras tabelas)\n")
            md.append(md_table(["tabela", "constraint", "colunas", "on delete"],
                               [[f"{c['schema']}.{c['table']}", c["name"], c["columns"], c["on_delete"]] for c in fks_in[key]]))
        md.append("\n## Índices\n")
        md.append(md_table(["nome", "método", "colunas", "único", "válido", "predicado", "definição"],
                           [[i["name"], i["method"], i["columns"], i["is_unique"], i["is_valid"], code(i["predicate"]), code(i["definition"])] for i in idx.get(key, [])]))
        md.append("\n## Policies (RLS)\n")
        if not t["rls_enabled"]:
            md.append("> ⚠️ RLS **desabilitado** nesta tabela.\n\n")
        elif not pol.get(key):
            md.append("> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).\n\n")
        for p in pol.get(key, []):
            md.append(f"### `{p['name']}`\n")
            md.append(md_table(["campo", "valor"], [["comando", p["cmd"]], ["tipo", p["permissive"]], ["roles", p["roles"]],
                                                     ["USING", code(p["using"])], ["WITH CHECK", code(p["with_check"])]]))
        md.append("\n## Triggers\n")
        md.append(md_table(["nome", "timing", "eventos", "nível", "status", "função"],
                           [[x["name"], x["timing"], x["events"], x["level"], x["status"], x["function"]] for x in trg.get(key, [])]))
        md.append("\n## Grants\n")
        md.append(md_table(["role", "privilégios"], [[g["grantee"], g["privileges"]] for g in grants.get(key, [])]))
        if colgrants.get(key):
            md.append("\nGrants por coluna:\n\n" + md_table(["coluna", "role", "privilégios"], [[g["column"], g["grantee"], g["privileges"]] for g in colgrants[key]]))
        write(OUT / rel, "\n".join(md))

    write(OUT / "tables.md", "# Tabelas\n\n" + banner("tables") + "Um arquivo por tabela em `tables/<schema>/<tabela>.md` "
          "(colunas, constraints, índices, RLS/policies, triggers, grants). Métricas de volume em `stats.md`.\n\n"
          + md_table(["tabela", "tipo", "RLS", "policies", "colunas", "realtime", "comentário"], index_rows))

    # Triggers em schemas internos (auth/storage) que não têm arquivo de tabela
    ext = [x for x in db.get("triggers") or [] if x["schema"] in ("auth", "storage")]
    if ext:
        write(OUT / "tables" / "_supabase_internal_triggers.md", "# Triggers do app em tabelas internas (auth, storage)\n\n" + md_table(
            ["tabela", "trigger", "timing", "eventos", "status", "função", "definição"],
            [[f"{x['schema']}.{x['table']}", x["name"], x["timing"], x["events"], x["status"], x["function"], code(x["definition"])] for x in ext]))


def render_relationships(db: dict) -> None:
    fks = [c for c in (db.get("constraints") or []) if c["type"] == "FOREIGN KEY"]
    md = ["# Relacionamentos (chaves estrangeiras)\n", banner("constraints"),
          md_table(["de", "colunas", "para", "colunas", "on delete", "on update"],
                   [[f"{c['schema']}.{c['table']}", c["columns"], f"{c['ref_schema']}.{c['ref_table']}", c["ref_columns"], c["on_delete"], c["on_update"]] for c in fks])]
    tables = [t for t in (db.get("tables") or []) if not t["is_partition"]]
    if 0 < len(tables) <= 120:
        cols = group(db.get("columns"), lambda r: (r["schema"], r["table"]))
        pks = {(c["schema"], c["table"]): set(c["columns"]) for c in (db.get("constraints") or []) if c["type"] == "PRIMARY KEY"}
        fkcols = {}
        for c in fks:
            fkcols.setdefault((c["schema"], c["table"]), set()).update(c["columns"])
        md.append("\n## Diagrama ER (Mermaid)\n\n```mermaid\nerDiagram")
        for t in tables:
            key = (t["schema"], t["name"])
            md.append(f"    {slug(t['schema'] + '_' + t['name'])} {{")
            for c in cols.get(key, [])[:25]:
                tag = "PK" if c["name"] in pks.get(key, set()) else ("FK" if c["name"] in fkcols.get(key, set()) else "")
                md.append(f"        {re.sub(r'[^A-Za-z0-9_]', '_', c['type'])} {re.sub(r'[^A-Za-z0-9_]', '_', c['name'])} {tag}".rstrip())
            if len(cols.get(key, [])) > 25:
                md.append("        text _mais_colunas_")
            md.append("    }")
        for c in fks:
            md.append(f"    {slug(c['ref_schema'] + '_' + c['ref_table'])} ||--o{{ {slug(c['schema'] + '_' + c['table'])} : \"{c['name']}\"")
        md.append("```\n")
    elif len(tables) > 120:
        md.append("\n_Diagrama omitido: mais de 120 tabelas._\n")
    write(OUT / "relationships.md", "\n".join(md))


def render_simple(db: dict, api_: dict, caller_sources: dict[str, str] | None = None) -> None:
    # Views
    md = ["# Views\n", banner("views")]
    for v in db.get("views") or []:
        md.append(f"## {v['schema']}.{v['name']} ({v['kind']})\n")
        md.append(md_table(["campo", "valor"], [["owner", v["owner"]], ["security_invoker", v["security_invoker"] if v["kind"] == "view" else "n/a"],
                                                 ["opções", ", ".join(v["options"] or [])], ["depende de", v["depends_on"]],
                                                 ["populada", v["populated"] if v["kind"] == "materialized" else "n/a"], ["comentário", v["comment"]]]))
        md.append(f"\n```sql\n{(v['definition'] or '').strip()}\n```\n")
    write(OUT / "views.md", "\n".join(md) if len(md) > 2 else "# Views\n\n_nenhuma_\n")

    # Functions
    rows = []
    missing_function_sql = 0
    for f in db.get("functions") or []:
        rel = f"functions/{slug(f['schema'])}/{slug(f['name'] + '__' + sha(f['args']))}.sql"
        if f.get("definition"):
            write(OUT / rel, f["definition"].strip())
        sql_available = bool(f.get("definition")) or ("functions" in CARRIED and (OUT / rel).is_file())
        # get_functions só solicita pg_get_functiondef para function/procedure.
        expects_sql = f.get("kind") not in ("aggregate", "window")
        if not sql_available and expects_sql:
            missing_function_sql += 1
        unavailable = "SQL indisponível" if expects_sql else "SQL não coletado para este tipo"
        label = f"[{f['schema']}.{f['name']}]({rel})" if sql_available else f"{code(f['schema'] + '.' + f['name'])} ({unavailable})"
        cl = f.get("callers") or {}
        code_refs = ", ".join(c["file"] for c in cl.get("code", [])[:6]) + (f" (+{cl['code_total_files'] - 6})" if cl.get("code_total_files", 0) > 6 else "")
        rows.append([label, code(f["args"]), code(f["returns"]), f["language"], f["kind"],
                     "trigger" if f["is_trigger_fn"] else "", f["security_definer"], f["volatility"], ", ".join(f["config"] or []),
                     f["execute_api_roles"] or ("PUBLIC" if f["execute_public"] else ""),
                     code_refs or ("—" if cl else "n/d"), cl.get("cron") or "", cl.get("triggers") or "",
                     (cl.get("db") or []) + [f"view:{v}" for v in cl.get("views") or []], f.get("comment")])
    if missing_function_sql:
        record_error("functions.sql", f"SQL indisponível para {missing_function_sql} função(ões); arquivos anteriores ausentes e nenhum corpo SQL coletado.")
    write(OUT / "functions.md", "# Functions / Procedures\n\n" + banner("functions") +
          "Corpo completo em `functions/<schema>/<nome>__<hash>.sql`. "
          "Entradas `aggregate` e `window` são inventariadas sem corpo SQL. "
          "Função em schema exposto com EXECUTE para anon/authenticated = endpoint RPC (`/rest/v1/rpc/<nome>`). "
          "`security definer` executa com privilégios do owner — exige `SET search_path`.\n\n"
          "Colunas de uso: **código** = referências estáticas em arquivos do repo (`.rpc('fn')` ou `fn(`), **cron** = jobs do pg_cron que a executam, "
          "**triggers** = triggers que a disparam, **banco** = outras funções e views que a usam. Busca é por nome (overloads compartilham). "
          "Assinaturas DDL, histórico e arquivos de teste não demonstram uso atual no código. Ausência de referência não prova que uma função pode ser removida.\n\n"
          + callers_status_table(caller_sources)
          + (md_table(["função", "args", "retorno", "linguagem", "tipo", "trigger fn", "security definer", "volatilidade", "config", "EXECUTE (roles API)",
                       "código", "cron", "triggers", "banco", "comentário"], rows) if db.get("functions") is not None
             else "_Coleta indisponível; nenhuma versão anterior foi encontrada._\n"))

    # Triggers
    write(OUT / "triggers.md", "# Triggers\n\n" + banner("triggers") + md_table(
        ["tabela", "trigger", "timing", "eventos", "nível", "status", "função", "definição"],
        [[f"{t['schema']}.{t['table']}", t["name"], t["timing"], t["events"], t["level"], t["status"], t["function"], code(t["definition"])] for t in db.get("triggers") or []]))

    # Policies
    md = ["# Policies (RLS)\n", banner("policies"), "Visão consolidada (inclui `storage.objects` e `realtime.messages`); detalhes por tabela em `tables/`.\n"]
    md.append(md_table(["tabela", "policy", "cmd", "tipo", "roles", "USING", "WITH CHECK"],
                       [[f"{p['schema']}.{p['table']}", p["name"], p["cmd"], p["permissive"], p["roles"], code(p["using"]), code(p["with_check"])]
                        for p in db.get("policies") or []]))
    write(OUT / "policies.md", "\n".join(md))

    # Lints
    lints = db.get("lints") or []
    write(OUT / "lints.md", "# Lints de segurança e performance\n\n" + banner("lints") +
          "Verificações objetivas feitas no catálogo. Um agente deve ler isto antes de propor mudanças em RLS, functions ou índices.\n\n"
          + md_table(["severidade", "código", "objeto", "detalhe"], [[l["severity"], l["code"], l["object"], l["detail"]] for l in lints]))

    # Indexes
    write(OUT / "indexes.md", "# Índices\n\n" + banner("indexes") + "Uso e tamanho em `stats.md`.\n\n" + md_table(
        ["tabela", "índice", "método", "colunas", "único", "válido", "predicado"],
        [[f"{i['schema']}.{i['table']}", i["name"], i["method"], i["columns"], i["is_unique"], i["is_valid"], code(i["predicate"])] for i in db.get("indexes") or []]))

    # Types (+ onde cada enum é usado)
    enum_usage: dict[str, list[str]] = {}
    for c in db.get("columns") or []:
        if c.get("is_enum"):
            enum_usage.setdefault(c["type"].split(".")[-1].strip('"'), []).append(f"{c['schema']}.{c['table']}.{c['name']}")
    write(OUT / "types-enums.md", "# Tipos customizados (enums, domains, composites)\n\n" + banner("types") + md_table(
        ["tipo", "kind", "valores / definição", "usado em"],
        [[f"{t['schema']}.{t['name']}", t["kind"], t["values"] or t["definition"], sorted(enum_usage.get(t["name"], []))] for t in db.get("types") or []]))

    # Extensions / sequences / schemas
    write(OUT / "extensions.md", "# Extensões\n\n" + banner("extensions") + md_table(
        ["extensão", "versão instalada", "versão disponível", "schema"],
        [[e["name"], e["version"], e["available_version"], e["schema"]] for e in db.get("extensions") or []]))
    write(OUT / "sequences.md", "# Sequences\n\n" + banner("sequences") + md_table(
        ["sequence", "tipo", "start", "incremento", "cycle", "pertence a"],
        [[f"{s['schema']}.{s['name']}", s["data_type"], s["start_value"], s["increment"], s["cycle"], s["owned_by"]] for s in db.get("sequences") or []]))
    write(OUT / "schemas.md", "# Schemas\n\n" + banner("schemas") + "Schemas internos do Supabase ficam fora da introspecção geral "
          f"(`{', '.join(sorted(SUPABASE_INTERNAL_SCHEMAS - FORCE_INCLUDE))}`).\n\n" + md_table(
        ["schema", "owner", "USAGE para roles da API", "comentário"],
        [[s["name"], s["owner"], s["usage_api_roles"], s["comment"]] for s in db.get("schemas") or []]))

    # Grants + roles
    g = db.get("grants") or {}
    md = ["# Grants\n", banner("grants"), "Roles da API: `anon` (sem login), `authenticated` (logado), `service_role` (bypass RLS). "
          "Grants de sistema (postgres, supabase_*) omitidos.\n", "## Tabelas e views\n",
          md_table(["objeto", "role", "privilégios"], [[f"{x['schema']}.{x['table']}", x["grantee"], x["privileges"]] for x in g.get("tables") or []]),
          "\n## Colunas (grants parciais)\n",
          md_table(["coluna", "role", "privilégios"], [[f"{x['schema']}.{x['table']}.{x['column']}", x["grantee"], x["privileges"]] for x in g.get("columns") or []]),
          "\n## Sequences (roles da API)\n",
          md_table(["sequence", "role", "privilégios"], [[f"{x['schema']}.{x['sequence']}", x["grantee"], x["privileges"]] for x in g.get("sequences") or []]),
          "\n## Default privileges (aplicam-se a objetos NOVOS)\n",
          md_table(["schema", "owner", "tipo", "ACL"], [[x["schema"], x["owner_role"], x["object_type"], x["acl"]] for x in g.get("default_privileges") or []])]
    write(OUT / "grants.md", "\n".join(md))
    write(OUT / "roles.md", "# Roles\n\n" + banner("roles") + "`config` traz limites por role (ex.: `statement_timeout` de anon/authenticated).\n\n" + md_table(
        ["role", "superuser", "login", "bypass RLS", "create role", "create db", "conn limit", "config", "membro de"],
        [[r["name"], r["superuser"], r["login"], r["bypass_rls"], r["create_role"], r["create_db"], r["conn_limit"], r["config"], r["member_of"]] for r in db.get("roles") or []]))

    # Realtime
    rt = db.get("realtime") or {}
    tables = {(t["schema"], t["name"]): t for t in db.get("tables") or []}
    write(OUT / "realtime.md", "# Realtime\n\n" + banner("realtime") + "## Publications\n\n" + md_table(
        ["publication", "all tables", "insert", "update", "delete", "truncate"],
        [[p["publication"], p["all_tables"], p["insert"], p["update"], p["delete"], p["truncate"]] for p in rt.get("publications") or []])
        + "\n## Tabelas publicadas (Postgres Changes)\n\n" + md_table(["publication", "tabela", "replica identity"],
            [[t["publication"], f"{t['schema']}.{t['table']}", (tables.get((t["schema"], t["table"])) or {}).get("replica_identity", "")] for t in rt.get("tables") or []])
        + "\n## Broadcast / Presence (policies em realtime.messages)\n\n" + md_table(["policy", "cmd", "roles", "USING", "WITH CHECK"],
            [[p["name"], p["cmd"], p["roles"], code(p["using"]), code(p["with_check"])] for p in db.get("policies") or [] if p["schema"] == "realtime"]))

    # Cron / queues
    cron = db.get("cron") or {}
    if not cron.get("installed"):
        write(OUT / "cron.md", "# Cron (pg_cron)\n\n_extensão pg_cron não instalada_\n")
    else:
        write(OUT / "cron.md", "# Cron (pg_cron)\n\n" + banner("cron") + "Horários em UTC. Execuções recentes em `cron-runs.md`.\n\n" + md_table(
            ["id", "nome", "schedule", "ativo", "database", "usuário", "comando"],
            [[j["jobid"], j["jobname"], code(j["schedule"]), j["active"], j["database"], j["username"], code(j["command"])] for j in cron.get("jobs") or []]))
    qs = db.get("queues") or {}
    write(OUT / "queues.md", "# Queues (pgmq)\n\n" + (banner("queues") + md_table(
        ["fila", "particionada", "unlogged", "criada em"],
        [[x["queue_name"], x["is_partitioned"], x["is_unlogged"], x["created_at"]] for x in qs.get("queues") or []]) if qs.get("installed") else "_extensão pgmq não instalada_\n"))

    # Migrations
    rows = []
    missing_migration_sql = 0
    for m in db.get("migrations") or []:
        name = slug(f"{m['version']}_{m.get('name') or ''}")
        path = OUT / "migrations" / f"{name}.sql"
        stmts = m.get("statements")
        if isinstance(stmts, int):
            # Contador do snapshot compacto: o SQL integral permanece no arquivo anterior.
            count = stmts
        else:
            stmts = stmts or []
            sql = "\n\n".join(stmts) if isinstance(stmts, list) else str(stmts)
            write(path, sql.strip() or "-- (sem statements registrados)")
            count = len(stmts) if isinstance(stmts, list) else 1
        if path.is_file():
            label = f"[{m.get('name') or ''}](migrations/{name}.sql)"
        else:
            label = f"{m.get('name') or ''} (SQL indisponível)"
            missing_migration_sql += 1
        rows.append([m["version"], label, count])
    if missing_migration_sql:
        record_error("migrations.sql", f"SQL indisponível para {missing_migration_sql} migration(s); arquivos anteriores ausentes e nenhum SQL coletado.")
    write(OUT / "migrations.md", "# Migrations aplicadas (supabase_migrations.schema_migrations)\n\n" + banner("migrations") +
          "SQL em `migrations/<versao>_<nome>.sql`. Mudanças feitas pelo Dashboard/SQL Editor **não** aparecem aqui — "
          "compare com `schema.sql` para ver o estado real.\n\n" + (md_table(["versão", "nome", "statements"], rows)
          if db.get("migrations") is not None else "_Coleta indisponível; nenhuma versão anterior foi encontrada._\n"))

    # Storage
    write(OUT / "storage.md", "# Storage\n\n" + banner("storage") + "Policies de `storage.objects`/`storage.buckets` em `policies.md`. Contagens em `stats.md`.\n\n" + md_table(
        ["bucket", "público", "limite por arquivo", "mime permitidos", "criado em"],
        [[b["id"], b["public"], human_bytes(b["file_size_limit"]) if b["file_size_limit"] else "", b["allowed_mime_types"], b["created_at"]] for b in db.get("storage") or []])
        + ("\n## Configuração (Management API)\n\n```json\n" + dumps(api_["storage_config"]) + "\n```\n" if api_.get("storage_config") else ""))

    # Auth
    md = ["# Auth\n", "Contagens de usuários em `stats.md` (apenas agregados — sem dados pessoais).\n"]
    if api_.get("auth_config"):
        cfg = api_["auth_config"]
        hooks = {k: v for k, v in cfg.items() if k.startswith("hook_")} if isinstance(cfg, dict) else {}
        providers = sorted(k[len("external_"):-len("_enabled")] for k, v in cfg.items()
                           if isinstance(cfg, dict) and k.startswith("external_") and k.endswith("_enabled") and v)
        md.append("\n## Resumo\n\n" + md_table(["campo", "valor"], [
            ["site_url", cfg.get("site_url")], ["providers habilitados", providers], ["jwt_exp (s)", cfg.get("jwt_exp")],
            ["signup desabilitado", cfg.get("disable_signup")], ["confirmação de e-mail", cfg.get("mailer_autoconfirm") is False],
            ["MFA TOTP", cfg.get("mfa_totp_enroll_enabled")], ["hooks", [k for k, v in hooks.items() if k.endswith("_enabled") and v]]]))
        md.append("\n## Configuração completa (segredos redigidos)\n\n```json\n" + dumps(cfg) + "\n```\n")
    else:
        md.append("\n_Configuração indisponível (Management API desabilitada)._\n")
    write(OUT / "auth.md", "\n".join(md))

    # Vault / webhooks / foreign
    write(OUT / "vault.md", "# Vault (somente nomes — valores nunca são exportados)\n\n" + banner("vault") + md_table(
        ["nome", "descrição", "criado em"], [[v["name"], v["description"], v["created_at"]] for v in db.get("vault") or []]))
    write(OUT / "webhooks.md", "# Database Webhooks (triggers -> supabase_functions.http_request)\n\n" + banner("webhooks") + md_table(
        ["tabela", "trigger", "definição"], [[f"{w['schema']}.{w['table']}", w["name"], code(w["definition"])] for w in db.get("webhooks") or []]))
    write(OUT / "foreign-servers.md", "# Foreign servers (wrappers)\n\n" + banner("foreign_servers") + md_table(
        ["servidor", "wrapper", "opções"], [[f["name"], f["wrapper"], f["options"]] for f in db.get("foreign_servers") or []]))

    # Edge functions + project config
    if api_.get("enabled"):
        md = ["# Edge Functions\n", f"URL base: `{api_['url']}/functions/v1/<slug>`. Metadados por função em `edge-functions/<slug>/README.md`. "
              "A Management API devolve só o bundle compilado; o fonte canônico é `supabase/functions/<slug>/` no repo.\n",
              md_table(["slug", "nome", "status", "versão", "verify_jwt", "entrypoint"],
                       [[f["slug"], f["name"], f["status"], f["version"], f["verify_jwt"], f["entrypoint_path"]] for f in api_.get("edge_functions") or []])]
        md.append("\n## Secrets (apenas nomes)\n\n" + md_table(["nome"], [[s] for s in api_.get("secrets_names") or []]))
        write(OUT / "edge-functions.md", "\n".join(md))
        cfg = {k: api_.get(k) for k in ("project", "url", "postgrest_config", "postgres_config", "pooler_config", "network_restrictions",
                                        "ssl_enforcement", "custom_hostname", "branches", "backups_config")}
        pr = api_.get("postgrest_config") or {}
        write(OUT / "project-config.md", "# Configuração do projeto (Management API, segredos redigidos)\n\n" + md_table(["campo", "valor"], [
            ["projeto", (api_.get("project") or {}).get("name")], ["região", (api_.get("project") or {}).get("region")], ["URL", api_["url"]],
            ["schemas expostos (PostgREST)", pr.get("db_schema")], ["max_rows (PostgREST)", pr.get("max_rows")],
            ["extra_search_path", pr.get("db_extra_search_path")], ["PITR", (api_.get("backups_config") or {}).get("pitr_enabled")],
            ["branches", len(api_.get("branches") or [])]]) + "\n```json\n" + dumps(cfg) + "\n```\n")
    else:
        write(OUT / "edge-functions.md", "# Edge Functions\n\n_Management API desabilitada: defina SUPABASE_PROJECT_REF e SUPABASE_ACCESS_TOKEN._\n")
        write(OUT / "project-config.md", "# Configuração do projeto\n\n_Management API desabilitada._\n")


def render_stats(stats: dict, api_stats: dict, db: dict) -> None:
    ts = stats.get("table_stats") or []
    ist = stats.get("index_stats") or []
    ds = stats.get("db_stats") or {}
    md = ["# Métricas (voláteis — mudam sem alteração de schema)\n",
          "Valores aproximados de propósito, para não gerar commits a cada coleta. Fora de `snapshot.json`; o bruto está em `stats.json`.\n",
          "## Banco\n", md_table(["métrica", "valor"], [["tamanho", human_bytes(ds.get("database_bytes"))]] +
                                 [[f"schema {s['schema']}", human_bytes(s["bytes"])] for s in ds.get("schema_bytes") or []]),
          "\n## Tabelas (ordenadas por tamanho)\n",
          md_table(["tabela", "linhas (~)", "total", "heap", "índices", "linhas mortas (~)", "seq scans (~)", "idx scans (~)", "último autovacuum"],
                   [[f"{t['schema']}.{t['name']}", approx(t["est_rows"]), human_bytes(t["total_bytes"]), human_bytes(t["heap_bytes"]),
                     human_bytes(t["index_bytes"]), approx(t["dead_rows"]), approx(t["seq_scan"]), approx(t["idx_scan"]),
                     str(t["last_autovacuum"])[:10] if t["last_autovacuum"] else ""] for t in ts]),
          "\n## Índices nunca usados (candidatos a remoção; ignore PK/UNIQUE)\n",
          md_table(["índice", "tabela", "tamanho"], [[i["name"], f"{i['schema']}.{i['table']}", human_bytes(i["bytes"])]
                                                     for i in ist if i["scans"] == 0 and not i["is_unique"] and not i["is_primary"] and i["bytes"] > 65536]),
          "\n## Storage\n", md_table(["bucket", "objetos (~)", "tamanho"], [[s["bucket_id"], approx(s["objects"]), human_bytes(s["bytes"])] for s in ds.get("storage") or []]),
          "\n## Auth (agregados)\n"]
    a = ds.get("auth") or {}
    md.append(md_table(["métrica", "valor"], [["usuários (~)", approx(a.get("users_total"))], ["confirmados (~)", approx(a.get("users_confirmed"))],
                                            ["criados últimos 30d (~)", approx(a.get("users_last_30d"))]]))
    md.append(md_table(["provider", "usuários (~)"], [[i["provider"], approx(i["users"])] for i in a.get("identities_by_provider") or []]))
    if ds.get("queues"):
        md.append("\n## Filas (pgmq)\n" + md_table(["fila", "tamanho", "msg mais antiga (s)", "total"],
                                                  [[x["queue_name"], x["queue_length"], x["oldest_msg_age_sec"], approx(x["total_messages"])] for x in ds["queues"]]))
    if ds.get("top_queries"):
        md.append("\n## Consultas mais custosas (pg_stat_statements, desde o último reset)\n" + md_table(
            ["role", "chamadas (~)", "total ms (~)", "média ms", "query"],
            [[x["role"], approx(x["calls"]), approx(x["total_ms"]), x["mean_ms"], code(x["query"])] for x in ds["top_queries"]]))
    md.append("\n## Conexões\n" + md_table(["usuário", "estado", "n"], [[c["usename"], c["state"], c["n"]] for c in ds.get("connections") or []]))
    if api_stats.get("health"):
        md.append("\n## Saúde dos serviços\n```json\n" + dumps(api_stats["health"]) + "\n```\n")
    write(OUT / "stats.md", "\n".join(md))
    write(OUT / "stats.json", dumps({"db": stats, "api": api_stats}))

    # cron runs
    jobs = ((db.get("cron") or {}).get("jobs")) or []
    runs = group(stats.get("cron_runs"), lambda r: r["jobid"])
    md = ["# Cron — execuções recentes\n", f"Últimas {CRON_RUNS_PER_JOB} por job (7 dias). Definições em `cron.md`.\n"]
    for j in jobs:
        md.append(f"\n## {j['jobid']} · {j['jobname'] or '(sem nome)'}\n")
        md.append(md_table(["início (UTC)", "status", "duração (s)", "mensagem"],
                           [[str(r["start_time"])[:19], r["status"], r["seconds"], r["return_message"]] for r in runs.get(j["jobid"], [])]))
    write(OUT / "cron-runs.md", "\n".join(md))


def render_readme(snap: dict, api_: dict, caller_sources: dict[str, str] | None = None) -> None:
    db = snap.get("db", {}) or {}
    cron = db.get("cron") or {}
    lints = db.get("lints") or []
    counts = [
        ["tabelas", len(db.get("tables") or [])], ["colunas", len(db.get("columns") or [])], ["views", len(db.get("views") or [])],
        ["functions", len(db["functions"]) if db.get("functions") is not None else "n/d"], ["triggers", len(db.get("triggers") or [])], ["policies (RLS)", len(db.get("policies") or [])],
        ["índices", len(db.get("indexes") or [])], ["tipos/enums", len(db.get("types") or [])], ["extensões", len(db.get("extensions") or [])],
        ["cron jobs", len(cron.get("jobs") or [])], ["filas pgmq", len(((db.get("queues") or {}).get("queues")) or [])],
        ["migrations", len(db["migrations"]) if db.get("migrations") is not None else "n/d"], ["buckets", len(db.get("storage") or [])],
        ["edge functions", len(api_.get("edge_functions") or []) if api_.get("enabled") else "n/d"], ["webhooks", len(db.get("webhooks") or [])],
        ["lints ALTA", sum(1 for l in lints if l["severity"] == "ALTA")], ["lints total", len(lints)],
    ]
    server = db.get("server") or {}
    md = [
        "# Snapshot Supabase — contexto para agentes de IA\n",
        os.environ.get("SUPABASE_SNAPSHOT_PUBLICACAO", "Gerado automaticamente a cada 10 min pelo workflow `contexto` (job `banco`). **Não edite manualmente.**") + "\n",
        "Última coleta concluída publicada: `manifest.json` → `gerado_em` (UTC), com erros e seções reaproveitadas. "
        "Última publicação: `git log -1 --format=%cI -- docs/contexto/supabase`. Mudanças estruturais estão em `CHANGELOG.md`.\n",
        "## Protocolo para agentes\n",
        "1. **Tabela**: leia só `tables/<schema>/<tabela>.md` (colunas, FKs, índices, RLS, triggers, grants). ER geral em `relationships.md`.",
        "2. **Antes de mexer em RLS/functions/índices**: leia `lints.md` e `policies.md`. Não repita problemas já listados.",
        "3. **DDL exato**: `schema.sql` (se habilitado). **Tipos TS**: `types.ts` (se habilitado). **Lógica no banco**: `functions.md` + `functions/`.",
        "4. **Migrations**: `migrations.md` lista o que já foi aplicado; nunca crie migration duplicada. Dashboard não registra ali — confira `schema.sql`.",
        "5. **Jobs e integrações**: `cron.md`, `queues.md`, `webhooks.md`, `edge-functions.md`, `realtime.md`, `storage.md`, `auth.md`.",
        "6. **Acesso**: `grants.md` + `roles.md` (timeouts por role) + `project-config.md` (schemas expostos, max_rows, PITR).",
        "7. **Volume/perf**: `stats.md` (tamanhos, linhas, índices sem uso, queries custosas) — aproximado, não use como contagem exata.",
        "8. `snapshot.json` = tudo estrutural em JSON para busca programática; `stats.json` = métricas brutas.\n",
        "## Resumo\n", md_table(["categoria", "quantidade"], counts),
        callers_status_table(caller_sources),
        "\n## Servidor\n", md_table(["propriedade", "valor"], [
            ["Postgres", server.get("server_version")], ["database", server.get("database")], ["timezone", server.get("timezone")],
            ["max_connections", server.get("max_connections")], ["statement_timeout (global)", server.get("statement_timeout")],
            ["projeto", (api_.get("project") or {}).get("name") if api_.get("enabled") else "n/d"],
            ["região", (api_.get("project") or {}).get("region") if api_.get("enabled") else "n/d"], ["URL", api_.get("url") or "n/d"]]),
        "\n## Arquivos\n", "| arquivo | conteúdo |\n|---|---|",
        "| `tables.md` / `tables/` | índice e um arquivo por tabela; `tables/_supabase_internal_triggers.md` = triggers em auth/storage |",
        "| `relationships.md` | todas as FKs + diagrama ER (Mermaid) |",
        "| `schema.sql` | DDL completo (pg_dump --schema-only, schemas: " + ", ".join(PGDUMP_SCHEMAS) + ") |" if PGDUMP else "| `schema.sql` | desligado neste repo (PGDUMP=false) |",
        "| `types.ts` | tipos TypeScript gerados pelo supabase CLI |" if GEN_TYPES else "| `types.ts` | desligado neste repo (GEN_TYPES=false) |",
        "| `lints.md` | RLS faltando, security definer sem search_path, views sem security_invoker, FK sem índice, RPC anon… |",
        "| `policies.md` | todas as policies RLS (incl. storage e realtime) |",
        "| `functions.md` / `functions/` | funções/procedures com corpo SQL e quem pode executar via RPC |",
        "| `triggers.md`, `indexes.md`, `views.md`, `types-enums.md`, `sequences.md`, `schemas.md`, `extensions.md` | objetos do schema |",
        "| `grants.md`, `roles.md` | privilégios (tabela, coluna, sequence, default privileges) e roles com config |",
        "| `cron.md`, `cron-runs.md`, `queues.md` | pg_cron (definições / execuções) e pgmq |",
        "| `migrations.md` / `migrations/` | migrations aplicadas e seu SQL |",
        "| `storage.md`, `auth.md`, `realtime.md`, `webhooks.md`, `vault.md`, `foreign-servers.md` | serviços e integrações |",
        "| `edge-functions.md` / `edge-functions/` | edge functions (versão, verify_jwt, URL) e nomes dos secrets |",
        "| `project-config.md` | PostgREST, Postgres, pooler, rede, SSL, branches, backups (redigido) |",
        "| `stats.md` / `stats.json` | métricas voláteis |",
        "| `snapshot.json` | tudo estrutural em JSON |",
        "| `manifest.json` | data UTC da coleta concluída, erros e seções reaproveitadas; usado pelo índice de contexto |",
        "| `CHANGELOG.md` | diff semântico a cada mudança |",
        "| `errors.md` | seções que falharam na última coleta |",
    ]
    if ERRORS or CARRIED:
        md.append("\n## ⚠️ Problemas na última coleta\n")
        if CARRIED:
            md.append(f"Seções reaproveitadas da coleta anterior: `{'`, `'.join(CARRIED)}`.\n")
        md.append(md_table(["seção", "erro"], [[e["section"], e["error"]] for e in ERRORS]))
    write(OUT / "README.md", "\n".join(md))
    write(OUT / "errors.md", "# Erros da última coleta\n\n" + (md_table(["seção", "erro"], [[e["section"], e["error"]] for e in ERRORS]) if ERRORS else "_nenhum_\n"))


def update_changelog(diff: list[tuple[str, str, list[str]]], previous_existed: bool) -> None:
    path = OUT / "CHANGELOG.md"
    old = path.read_text(encoding="utf-8") if path.exists() else "# CHANGELOG do snapshot Supabase\n\nDiff semântico gerado a cada coleta em que algo mudou.\n"
    if not diff and previous_existed:
        return
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    entry = [f"\n## {stamp}\n"]
    if not previous_existed:
        entry.append("- Snapshot inicial.\n")
    for cat, kind, keys in diff:
        shown = keys[:40]
        more = f" … (+{len(keys) - 40})" if len(keys) > 40 else ""
        entry.append(f"- **{cat}** {kind} ({len(keys)}): " + ", ".join(f"`{k}`" for k in shown) + more)
    head, _, tail = old.partition("\n## ")
    # mantém no máximo 300 entradas
    tail_parts = ("## " + tail).split("\n## ") if tail else []
    new = head.rstrip() + "\n" + "\n".join(entry) + ("\n\n" + "\n## ".join(tail_parts[:300]) if tail_parts else "\n")
    write(path, new)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main() -> int:
    if CONFIG_ERRORS:
        print("Configuração inválida: " + "; ".join(CONFIG_ERRORS), file=sys.stderr)
        return 2
    if not DB_URL:
        print("SUPABASE_DB_URL não definido", file=sys.stderr)
        return 2
    try:
        prepare_output_directory()
    except ValueError as error:
        print(f"Configuração inválida: {error}", file=sys.stderr)
        return 2

    previous = None
    prev_path = OUT / "snapshot.json"
    if prev_path.exists():
        try:
            previous = json.loads(prev_path.read_text(encoding="utf-8"))
            if previous.get("format_version") != FORMAT_VERSION:
                previous = None
        except Exception:  # noqa: BLE001
            previous = None

    db, stats = introspect_db((previous or {}).get("db"))
    if all(v is None for v in db.values()):
        log("Banco inteiro indisponível — nada será sobrescrito.")
        return 1

    caller_sources = build_function_callers(db)
    api_, api_stats = introspect_api((previous or {}).get("api"))
    schema_sql = run_pg_dump()
    types_ts = run_gen_types()
    # Se pg_dump/gen types falharam, mantém a versão anterior (com aviso em errors.md) em vez de apagar.
    if schema_sql is None and PGDUMP and (OUT / "schema.sql").exists():
        schema_sql = (OUT / "schema.sql").read_text(encoding="utf-8")
        CARRIED.append("schema.sql")
    if types_ts is None and GEN_TYPES and (OUT / "types.ts").exists():
        types_ts = (OUT / "types.ts").read_text(encoding="utf-8")
        CARRIED.append("types.ts")

    preserved = {"CHANGELOG.md", "edge-functions", "snapshot.json", ".gitattributes", OUTPUT_MARKER}
    preserved.update(name for name in ("functions", "migrations") if name in CARRIED)
    for item in OUT.iterdir():
        if item.name in preserved:
            continue
        shutil.rmtree(item) if item.is_dir() else item.unlink()

    snap = {"format_version": FORMAT_VERSION, "db": db, "api": api_, "errors": ERRORS, "carried": CARRIED}

    render_tables(db)
    render_relationships(db)
    render_simple(db, api_, caller_sources)
    render_stats(stats, api_stats, db)
    if schema_sql is not None:
        write(OUT / "schema.sql", schema_sql)
    elif previous and (OUT / "schema.sql").exists():
        pass
    if types_ts is not None:
        write(OUT / "types.ts", types_ts)

    new_fp = fingerprints(snap)
    old_fp = fingerprints(previous) if previous else {}
    diff = diff_fingerprints(old_fp, new_fp) if previous else []
    update_changelog(diff, previous_existed=previous is not None)
    render_readme(snap, api_, caller_sources)
    slim = json.loads(dumps(snap))
    for f in slim["db"].get("functions") or []:
        if f.get("definition"):
            f["definition_sha"] = sha(f["definition"]); f["definition"] = None
    for m in slim["db"].get("migrations") or []:
        if isinstance(m.get("statements"), (list, str)) and m["statements"]:
            m["statements_sha"] = sha(m["statements"]); m["statements"] = len(m["statements"]) if isinstance(m["statements"], list) else 1
    write(prev_path, dumps(slim))
    write(OUT / ".gitattributes", "* linguist-generated=true\n*.sql linguist-generated=true\n")
    # Frescor da coleta é independente de mudança estrutural. Só publica após concluir as saídas.
    write(OUT / "manifest.json", dumps({
        "produtor": "supabase-snapshot", "gerador": "scripts/supabase_snapshot/snapshot.py",
        "gerado_em": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "entrada": "README.md", "erros": ERRORS, "carried": CARRIED,
    }))

    log(f"concluído: {len(diff)} grupos de mudança, {len(ERRORS)} erros, {len(CARRIED)} seções reaproveitadas, saída em {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
