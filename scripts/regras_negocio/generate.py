#!/usr/bin/env python3
"""
AI Context Sync — gera e mantém atualizada a base de contexto do repositório
para agentes de IA (docs/ai-context/).

Uso:
  python scripts/ai_context/generate.py --repo . --out docs/ai-context [--llm] [--check]

Saída (Markdown + JSON):
  00-INDEX.md               ponto de entrada / ordem de leitura / checklist pré-tarefa
  01-VISAO-GERAL.md         o que o sistema é, stack, deploy
  02-ARQUITETURA.md         árvore, camadas, dependências entre módulos
  03-MODULOS.md             módulos com arquivos, exports e responsabilidade
  04-FUNCIONALIDADES.md     rotas/páginas, edge functions, endpoints, jobs
  05-FLUXO-DE-DADOS.md      tabela x arquivo, colunas usadas, RPC, storage, APIs, triggers, FKs
  06-BANCO-DE-DADOS.md      schema (migrations + database.types.ts)
  07-REGRAS-DE-NEGOCIO.md   regras: manuais, RLS, constraints, máquinas de estado, validações,
                            fórmulas, parâmetros, erros, testes, webhooks, efeitos colaterais
  08-INTEGRACOES.md         serviços externos, variáveis de ambiente, feature flags
  09-MUDANCAS-RECENTES.md   últimos commits e arquivos quentes
  10-ACESSO-E-SEGURANCA.md  perfis, guards, matriz RLS, service_role, funções públicas,
                            multi-tenancy, soft delete, auditoria, PII
  11-GLOSSARIO-E-LACUNAS.md glossário, dados de referência, auditoria de consistência,
                            o que NÃO foi possível verificar (perguntas ao humano)
  context.json              tudo em formato máquina
  manual/                   NUNCA sobrescrito — regras escritas por humanos

Sem dependências externas (stdlib). Opcional: síntese narrativa via API Anthropic (--llm).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

VERSION = "1.3.2"
BOT_COMMIT_PREFIX = "chore(ai-context)"

# --------------------------------------------------------------------------- #
# Configuração
# --------------------------------------------------------------------------- #
IGNORE_DIRS = {
    ".git", "node_modules", "dist", "build", ".next", ".nuxt", ".svelte-kit", "out",
    "coverage", ".turbo", ".cache", ".vercel", ".netlify", "__pycache__", ".venv", "venv",
    ".idea", ".vscode", "vendor", "target", ".pytest_cache", ".mypy_cache", "tmp", ".tmp",
    "storybook-static", ".parcel-cache", ".yarn", ".pnpm-store",
}
IGNORE_FILES_SUFFIX = (
    ".lock", "-lock.json", "-lock.yaml", ".min.js", ".min.css", ".map", ".png", ".jpg",
    ".jpeg", ".gif", ".svg", ".ico", ".webp", ".woff", ".woff2", ".ttf", ".eot", ".pdf",
    ".zip", ".gz", ".mp4", ".mp3", ".wav", ".bin", ".exe", ".dll", ".so", ".pyc",
)
CODE_EXT = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".py", ".go", ".rs",
    ".sql", ".php", ".rb", ".java", ".kt", ".cs", ".dart",
}
MAX_FILE_BYTES = 600_000
MAX_SQL_BYTES = 8_000_000
MAX_SNIPPET = 900
SECRET_RE = re.compile(
    r"(sk-[A-Za-z0-9_-]{10,}|sk_(?:live|test)_[A-Za-z0-9]{10,}|rk_(?:live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{30,}|xkeysib-[A-Za-z0-9-]{20,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|re_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|"
    r"ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|"
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?://[^\s'\"]+:[^\s'\"]+@|"
    r"(?i:password|senha|secret|token|api[_-]?key)\s*[:=]\s*['\"][^'\"\\\n]{8,}['\"])"
)
RULE_KEYWORDS = re.compile(
    r"\b(regra|rule|business|neg[oó]cio|deve|n[aã]o pode|must|must not|invariant|"
    r"valida[cç][aã]o|validation|permiss[aã]o|permission|somente|apenas|only if|limite|limit|"
    r"m[aá]ximo|m[ií]nimo|obrigat[oó]ri|required|prazo|deadline|vencimento|expira|"
    r"n[aã]o permit|forbidden|bloquei|cancelament|estorno|reembolso|desconto|comiss[aã]o|juros|multa)\b",
    re.IGNORECASE,
)
STATUS_FIELDS = r"(?:(?:\w+_)?(?:status|estado|situacao|situação|stage|etapa|fase|state|step|phase)|tipo|type|role|perfil)"
TENANT_COLS = {"tenant_id", "empresa_id", "organization_id", "org_id", "company_id", "loja_id",
               "account_id", "workspace_id", "cliente_id_tenant", "unidade_id", "filial_id", "clinic_id", "store_id"}
SOFT_DELETE_COLS = {"deleted_at", "is_deleted", "deleted", "ativo", "active", "is_active", "archived", "archived_at", "excluido", "removed_at"}
AUDIT_COLS = {"created_at", "updated_at", "created_by", "updated_by", "deleted_by", "criado_em", "atualizado_em", "criado_por"}
PII_RE = re.compile(r"\b(cpf|cnpj|rg|email|e_mail|telefone|phone|celular|whatsapp|endereco|address|cep|logradouro|nascimento|birth|senha|password|cartao|card_number|pan|passaporte|passport|ip_address|latitude|longitude|salario|renda)\b", re.I)
MONEY_RE = re.compile(r"\b(valor|preco|price|amount|total|subtotal|desconto|discount|frete|shipping|taxa|fee|custo|cost|saldo|balance|comissao|commission|imposto|tax|juros|multa)\w*", re.I)
STATUS_COL_RE = re.compile(r"^(?:\w+_)?(status|estado|situacao|stage|etapa|fase|state|step|phase)(?!_(?:at|by|id|em|date|time|reason|message|msg|code|count|history|changed\w*|updated\w*|label|text|detail\w*))(?:_\w+)?$", re.I)
NON_APP_DIRS = ("docs/", "doc/", "analise/", "qa/", "inventario/", "scripts/", "tools/", ".github/", "e2e/", "cypress/", "playwright/", "__mocks__/", "fixtures/", "examples/", "storybook/", "benchmarks?/")
NON_APP_RE = re.compile(r"^(?:" + "|".join(NON_APP_DIRS) + r")")


def is_app_code(r: str) -> bool:
    return not NON_APP_RE.match(r)

# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def log(msg: str) -> None:
    print(f"[ai-context] {msg}", file=sys.stderr)


def read_text(p: Path, limit: int = MAX_FILE_BYTES) -> str:
    try:
        if p.stat().st_size > limit:
            return ""
        return redact(p.read_text(encoding="utf-8", errors="replace").lstrip("\ufeff").replace("\r\n", "\n"))
    except Exception:
        return ""


def redact(s: str) -> str:
    return SECRET_RE.sub("[REDACTED]", s)


def rel(p: Path, root: Path) -> str:
    return p.relative_to(root).as_posix()


def is_archived_sql(p: Path, root: Path) -> bool:
    """SQL de outros projetos ou substituído não descreve o estado atual."""
    return p.suffix == ".sql" and bool({"_foreign", "_superseded"}.intersection(p.relative_to(root).parts[:-1]))


def trunc(s: str, n: int = MAX_SNIPPET) -> str:
    s = s.strip()
    return s if len(s) <= n else s[:n].rstrip() + " …"


def squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def git(root: Path, *args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, timeout=60).stdout.strip()
    except Exception:
        return ""


MAX_ROWS = 300


def md_table(headers: list[str], rows: list[list], max_rows: int = MAX_ROWS) -> str:
    if not rows:
        return "_nenhum item encontrado_\n"
    esc = lambda c: str(c).replace("|", "\\|").replace("\n", " ")
    out = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    out += ["| " + " | ".join(esc(c) for c in r) + " |" for r in rows[:max_rows]]
    if len(rows) > max_rows:
        out.append(f"| … +{len(rows) - max_rows} linhas — lista completa em `context.json` |" + " |" * (len(headers) - 1))
    return "\n".join(out) + "\n"


def files_cell(xs, n: int = 8) -> str:
    xs = list(xs)
    return "<br>".join(f"`{x}`" for x in xs[:n]) + (f"<br>… +{len(xs) - n}" if len(xs) > n else "")


def stable_hash(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=list).encode()).hexdigest()[:16]


def balanced(txt: str, start: int, open_ch: str = "(", close_ch: str = ")") -> int:
    """Índice do fechamento que casa com txt[start] (que deve ser open_ch). -1 se não fechar."""
    depth = 0
    in_str = None
    i = start
    while i < len(txt):
        ch = txt[i]
        if in_str:
            if ch == "\\":
                i += 2; continue
            if ch == in_str:
                in_str = None
        elif ch in ("'", '"', "`"):
            in_str = ch
        elif ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def strip_sql_comments(txt: str) -> str:
    txt = re.sub(r"/\*[\s\S]*?\*/", "", txt)
    return re.sub(r"--[^\n]*", "", txt)


def is_test_file(r: str) -> bool:
    return bool(re.search(r"(\.test\.|\.spec\.|__tests__/|/tests?/|/e2e/|/cypress/)", r))


# --------------------------------------------------------------------------- #
# 1. Inventário
# --------------------------------------------------------------------------- #
def walk_repo(root: Path, out_dir: Path) -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dp = Path(dirpath)
        dirnames[:] = sorted(d for d in dirnames if d not in IGNORE_DIRS and not (dp / d).is_symlink()
                             and (dp / d).resolve() != out_dir.resolve())
        for fn in sorted(filenames):
            p = dp / fn
            if p.is_symlink() or fn.endswith(IGNORE_FILES_SUFFIX):
                continue
            files.append(p)
    return files


def dir_tree(root: Path, files: list[Path], depth: int = 3, max_lines: int = 160) -> str:
    dirs: dict[str, int] = defaultdict(int)
    for f in files:
        parts = f.relative_to(root).parts
        for i in range(1, min(len(parts), depth + 1)):
            dirs["/".join(parts[:i])] += 1
    lines = [f"{'  ' * d.count('/')}{d.split('/')[-1]}/  ({dirs[d]} arquivos)" for d in sorted(dirs) if d.count("/") < depth]
    if len(lines) > max_lines:
        lines = lines[:max_lines] + [f"… (+{len(lines) - max_lines} pastas)"]
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# 2. Stack / infra
# --------------------------------------------------------------------------- #
KNOWN_DEPS = {
    "react": "Frontend React", "next": "Framework Next.js", "nuxt": "Framework Nuxt", "vite": "Bundler Vite",
    "vue": "Frontend Vue", "svelte": "Frontend Svelte", "@sveltejs/kit": "SvelteKit",
    "@angular/core": "Frontend Angular", "react-router-dom": "Roteamento (React Router)",
    "@tanstack/react-query": "Cache/fetch de dados (TanStack Query)", "swr": "SWR",
    "@supabase/supabase-js": "Supabase (DB/Auth/Storage/Functions)",
    "@supabase/ssr": "Supabase SSR", "firebase": "Firebase", "prisma": "ORM Prisma",
    "@prisma/client": "ORM Prisma", "drizzle-orm": "ORM Drizzle", "typeorm": "ORM TypeORM",
    "mongoose": "MongoDB (Mongoose)", "express": "Servidor Express", "hono": "Servidor Hono",
    "fastify": "Servidor Fastify", "koa": "Servidor Koa", "@nestjs/core": "NestJS",
    "zod": "Validação de schemas (Zod)", "yup": "Validação (Yup)", "valibot": "Validação (Valibot)",
    "react-hook-form": "Forms (react-hook-form)", "tailwindcss": "Tailwind CSS",
    "@radix-ui/react-dialog": "Radix UI / shadcn", "lucide-react": "Ícones Lucide",
    "stripe": "Pagamentos Stripe", "@stripe/stripe-js": "Stripe JS", "mercadopago": "Mercado Pago",
    "asaas": "Asaas", "axios": "HTTP client Axios", "openai": "OpenAI SDK", "@anthropic-ai/sdk": "Anthropic SDK",
    "resend": "E-mail Resend", "nodemailer": "E-mail SMTP", "@sendgrid/mail": "E-mail SendGrid",
    "twilio": "Twilio (SMS/WhatsApp)", "socket.io": "WebSocket", "bullmq": "Filas BullMQ", "ioredis": "Redis",
    "redis": "Redis", "pg": "PostgreSQL driver", "jsonwebtoken": "JWT", "jose": "JWT (jose)",
    "next-auth": "NextAuth", "@clerk/nextjs": "Clerk Auth", "i18next": "i18n",
    "recharts": "Gráficos Recharts", "chart.js": "Gráficos Chart.js", "zustand": "Estado Zustand",
    "@reduxjs/toolkit": "Estado Redux", "jotai": "Estado Jotai", "vitest": "Testes Vitest",
    "jest": "Testes Jest", "@playwright/test": "E2E Playwright", "cypress": "E2E Cypress",
    "puppeteer": "Puppeteer", "date-fns": "Datas date-fns", "dayjs": "Datas dayjs", "luxon": "Datas luxon",
    "xlsx": "Excel (xlsx)", "jspdf": "PDF (jsPDF)", "pdf-lib": "PDF", "sharp": "Imagens sharp",
    "decimal.js": "Aritmética decimal (dinheiro)", "big.js": "Aritmética decimal (dinheiro)", "dinero.js": "Dinheiro (dinero.js)",
    "fastapi": "FastAPI (Python)", "django": "Django", "flask": "Flask", "sqlalchemy": "SQLAlchemy",
    "celery": "Celery", "pydantic": "Pydantic", "requests": "requests", "httpx": "httpx",
}
SIDE_EFFECT_DEPS = ("E-mail", "Twilio", "Stripe", "Mercado", "Asaas", "OpenAI", "Anthropic", "Firebase", "Supabase", "Redis", "Clerk", "NextAuth", "Filas", "WebSocket")


def detect_stack(root: Path, files: list[Path]) -> dict:
    stack: dict = {"frameworks": [], "deps": {}, "scripts": {}, "infra": [], "ci": [],
                   "package_manager": None, "languages": {}, "monorepo_packages": [], "supabase_config": {}}
    ext_count: dict[str, int] = defaultdict(int)
    for f in files:
        if f.suffix in CODE_EXT:
            ext_count[f.suffix] += 1
    stack["languages"] = dict(sorted(ext_count.items(), key=lambda x: -x[1]))
    for pj in [p for p in files if p.name == "package.json"]:
        try:
            data = json.loads(read_text(pj))
        except Exception:
            continue
        r = rel(pj, root)
        if r != "package.json":
            stack["monorepo_packages"].append({"path": r, "name": data.get("name")})
        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
        for d, v in deps.items():
            if d in KNOWN_DEPS:
                stack["deps"][d] = {"version": v, "role": KNOWN_DEPS[d], "in": r}
        if r == "package.json":
            stack["scripts"] = data.get("scripts", {})
            stack["name"] = data.get("name")
            stack["description"] = data.get("description")
    for lock, pm in (("pnpm-lock.yaml", "pnpm"), ("yarn.lock", "yarn"), ("bun.lockb", "bun"), ("bun.lock", "bun"), ("package-lock.json", "npm")):
        if (root / lock).exists():
            stack["package_manager"] = pm; break
    for req in ("requirements.txt", "pyproject.toml", "Pipfile"):
        p = root / req
        if p.exists():
            txt = read_text(p).lower()
            for d, role in KNOWN_DEPS.items():
                if re.search(rf"^\s*{re.escape(d)}\b", txt, re.M):
                    stack["deps"][d] = {"version": "", "role": role, "in": req}
    infra_markers = {
        "Dockerfile": "Docker", "docker-compose.yml": "Docker Compose", "docker-compose.yaml": "Docker Compose",
        "docker-stack.yml": "Docker Swarm stack", "vercel.json": "Vercel", "netlify.toml": "Netlify",
        "wrangler.toml": "Cloudflare Workers", "fly.toml": "Fly.io", "render.yaml": "Render", "railway.json": "Railway",
        "supabase/config.toml": "Supabase CLI", "firebase.json": "Firebase Hosting", "serverless.yml": "Serverless Framework",
        "Procfile": "Heroku/Procfile", "traefik.yml": "Traefik", "nginx.conf": "Nginx",
        ".env.example": "Template de variáveis (.env.example)", "turbo.json": "Turborepo", "nx.json": "Nx", "lerna.json": "Lerna",
    }
    for f in files:
        r = rel(f, root)
        if r in infra_markers or f.name in infra_markers:
            stack["infra"].append({"file": r, "role": infra_markers.get(r) or infra_markers[f.name]})
        if r.startswith(".github/workflows/") and f.suffix in (".yml", ".yaml"):
            txt = read_text(f)
            name = re.search(r"^name:\s*(.+)$", txt, re.M)
            trig = re.findall(r"^\s{2}(push|pull_request|schedule|workflow_dispatch|release|repository_dispatch):", txt, re.M)
            stack["ci"].append({"file": r, "name": name.group(1).strip() if name else f.stem, "triggers": sorted(set(trig))})
    # supabase/config.toml: funções sem JWT, auth settings
    cfg = next((f for f in files if f.name == "config.toml" and f.parent.name == "supabase"), None)
    if cfg:
        txt = read_text(cfg)
        sc = {"functions_no_jwt": [], "auth": {}}
        for name, body in re.findall(r"\[functions\.([\w-]+)\]([^\[]*)", txt):
            if re.search(r"verify_jwt\s*=\s*false", body):
                sc["functions_no_jwt"].append(name)
        auth = re.search(r"\[auth\]([^\[]*)", txt)
        if auth:
            for k, v in re.findall(r"^\s*(\w+)\s*=\s*(.+)$", auth.group(1), re.M):
                if k in ("enable_signup", "jwt_expiry", "site_url", "enable_confirmations", "enable_anonymous_sign_ins", "minimum_password_length"):
                    sc["auth"][k] = v.strip()
        stack["supabase_config"] = sc
    fw, d = [], stack["deps"]
    if "next" in d: fw.append("Next.js")
    elif "react" in d: fw.append("React" + (" + Vite" if "vite" in d else ""))
    if "vue" in d: fw.append("Vue")
    if "@sveltejs/kit" in d: fw.append("SvelteKit")
    elif "svelte" in d: fw.append("Svelte")
    if "@angular/core" in d: fw.append("Angular")
    for k, n in (("express", "Express"), ("hono", "Hono"), ("fastify", "Fastify"), ("@nestjs/core", "NestJS"),
                 ("fastapi", "FastAPI"), ("django", "Django"), ("flask", "Flask")):
        if k in d: fw.append(n)
    if "@supabase/supabase-js" in d or (root / "supabase").is_dir(): fw.append("Supabase")
    if "prisma" in d or "@prisma/client" in d: fw.append("Prisma")
    if "drizzle-orm" in d: fw.append("Drizzle")
    stack["frameworks"] = fw
    return stack


# --------------------------------------------------------------------------- #
# 3. Análise de código-fonte
# --------------------------------------------------------------------------- #
EXPORT_RE = re.compile(r"^export\s+(?:default\s+)?(?:async\s+)?(function|const|class|interface|type|enum|let|var)\s+([A-Za-z_$][\w$]*)", re.M)
EXPORT_DEFAULT_RE = re.compile(r"^export\s+default\s+(?:function\s+)?([A-Za-z_$][\w$]*)", re.M)
PY_DEF_RE = re.compile(r"^(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)", re.M)
IMPORT_RE = re.compile(r"""(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]""")
REQUIRE_RE = re.compile(r"""require\(\s*['"]([^'"]+)['"]\s*\)""")
CHAIN = r"((?:\s*\.\s*\w+\s*\((?:[^()]|\([^()]*\))*\))*)"
NOT_TABLE_LB = r"(?<!storage)(?<!Buffer)(?<!Array)(?<!Uint8Array)(?<!Observable)(?<!Set)(?<!Map)(?<!Promise)(?<!Readable)(?<!Stream)(?<!from)"
SUPA_FROM_RE = re.compile(NOT_TABLE_LB + r"""\.from\(\s*['"`]([A-Za-z0-9_.]+)['"`]\s*\)""" + CHAIN, re.S)
SUPA_FROM_DYN_RE = re.compile(NOT_TABLE_LB + r"""\.from\(\s*(?!Deno|JSON|Object|Array|Buffer)[A-Za-z_$][\w$.]*\s*\)""")
SUPA_RPC_RE = re.compile(r"""\.rpc\(\s*['"`]([A-Za-z0-9_]+)['"`]""")
SUPA_INVOKE_RE = re.compile(r"""functions\s*\.\s*invoke\(\s*['"`]([A-Za-z0-9_-]+)['"`]""")
SUPA_STORAGE_RE = re.compile(r"""storage\s*\.\s*from\(\s*['"`]([A-Za-z0-9_-]+)['"`]""")
SUPA_CHANNEL_RE = re.compile(r"""\.channel\(\s*['"`]([^'"`]+)['"`]""")
FILTER_COL_RE = re.compile(r"""\.\s*(eq|neq|gt|gte|lt|lte|like|ilike|in|is|contains|order|match|not|textSearch)\s*\(\s*['"`]([\w.]+)['"`]""")
SELECT_COLS_RE = re.compile(r"""\.\s*select\s*\(\s*['"`]([^'"`]*)['"`]""")
FETCH_URL_RE = re.compile(r"""(?:fetch|axios(?:\.\w+)?|got|ky(?:\.\w+)?)\(\s*[`'"](https?://[^'"`\s?]+)""")
ENV_RE = re.compile(
    r"(?:process\.env\.([A-Z][A-Z0-9_]+)|process\.env\[\s*['\"]([A-Z][A-Z0-9_]+)['\"]\s*\]|import\.meta\.env\.([A-Z][A-Z0-9_]+)|"
    r"Deno\.env\.get\(\s*['\"]([A-Z][A-Z0-9_]+)['\"]|os\.(?:environ\.get|getenv)\(\s*['\"]([A-Z][A-Z0-9_]+)['\"]|"
    r"os\.environ\[\s*['\"]([A-Z][A-Z0-9_]+)['\"]\s*\])")
ROUTE_TAG_RE = re.compile(r"""<Route\s+((?:[^<>]|<[^<>]*>)*?)/?>""", re.S)
ROUTE_PATH_RE = re.compile(r"""\bpath\s*=\s*['"{]([^'"}]+)['"}]""")
ROUTE_COMP_RE = re.compile(r"""\b(?:element|Component|component)\s*=\s*\{\s*<?\s*([A-Za-z_][\w.]*)""")
GUARD_NAMES = r"(ProtectedRoute|PrivateRoute|RequireAuth|AuthGuard|AdminRoute|RoleGuard|Protected|RequireRole|AuthRoute|GuestRoute|PublicRoute|withAuth|requireAuth|requireAdmin)"
GUARD_IN_TAG_RE = re.compile(r"<" + GUARD_NAMES + r"\b([^>]*)>")
ROLES_PROP_RE = re.compile(r"""(?:allowedRoles|roles|role|requiredRole|permissions?|allow)\s*=\s*\{?\s*\[?\s*((?:['"][\w-]+['"]\s*,?\s*)+)""")
ROUTE_OBJ_RE = re.compile(r"""\{\s*path\s*:\s*['"]([^'"]+)['"][^}]*?(?:element\s*:\s*<([A-Za-z_][\w.]*)|(?:component|Component|lazy)\s*:\s*([A-Za-z_][\w.]*))""", re.S)
NAVIGATE_RE = re.compile(r"""(?:navigate|router\.push|router\.replace|redirect|href=)\(?\s*['"`](/[^'"`\s$]*)""")
SERVER_ROUTE_RE = re.compile(r"""\b(?:app|router|server|api)\.(get|post|put|patch|delete|all|use)\(\s*['"`]([^'"`]+)['"`]""")
PY_ROUTE_RE = re.compile(r"""@(?:app|router|api|bp|blueprint)\.(get|post|put|patch|delete|route)\(\s*['"]([^'"]+)['"]""")
MIDDLEWARE_MATCHER_RE = re.compile(r"""matcher\s*:\s*\[([^\]]*)\]""")
THROW_RE = re.compile(r"""throw\s+new\s+\w*Error\(\s*[`'"]([^`'"]{6,160})[`'"]""")
TOAST_ERR_RE = re.compile(r"""(?:toast\.error|toast\.warning|toast\.warn|message\.error|notify\.error|notification\.error|alert|setError\(\s*['"][\w.]+['"]\s*,)\s*\(?\s*(?:\{\s*(?:title|description|message)\s*:\s*)?[`'"]([^`'"]{6,160})[`'"]""")
TOAST_VARIANT_RE = re.compile(r"""toast\(\s*\{[^}]*?(?:title|description)\s*:\s*[`'"]([^`'"]{6,160})[`'"][^}]*?variant\s*:\s*['"]destructive['"]""", re.S)
RESP_ERR_RE = re.compile(r"""(?:\.json|new\s+Response)\s*\(\s*(?:JSON\.stringify\(\s*)?(?:\{\s*(?:error|message|msg|detail)\s*:\s*)?[`'"]([^`'"]{6,160})[`'"][^;\n]{0,160}?status\s*:\s*4\d\d""")
RESP_ERR2_RE = re.compile(r"""res\.status\(\s*4\d\d\s*\)\.(?:json|send)\s*\(\s*(?:\{\s*(?:error|message|msg|detail)\s*:\s*)?[`'"]([^`'"]{6,160})[`'"]""")
PY_HTTPEXC_RE = re.compile(r"""HTTPException\([^)]*?detail\s*=\s*[`'"]([^`'"]{6,160})[`'"]""")
RAISE_PY_RE = re.compile(r"""raise\s+\w*(?:Error|Exception)\(\s*(?:detail\s*=\s*)?[`'"]([^`'"]{6,160})[`'"]""")
ZOD_START_RE = re.compile(r"""(?:export\s+)?(?:const|let)\s+([A-Za-z_]\w*)\s*(?::\s*[^=]+)?=\s*z\s*\.\s*(object|enum|discriminatedUnion|union|array|string|number)\s*\(""")
ZOD_REFINE_MSG_RE = re.compile(r"""\.(?:refine|superRefine)\([\s\S]*?(?:message\s*:\s*|,\s*)[`'"]([^`'"]{4,200})[`'"]""")
RHF_REGISTER_RE = re.compile(r"""register\(\s*['"]([\w.]+)['"]\s*,\s*\{([^}]*)\}""")
RHF_RULES_RE = re.compile(r"""name\s*=\s*['"]([\w.]+)['"][^>]*?rules\s*=\s*\{\{([^}]*)\}\}""", re.S)
HTML_INPUT_RE = re.compile(r"""<(?:input|Input|select|Select|textarea|Textarea)\b([^>]*?)/?>""", re.S)
ENUM_RE = re.compile(r"""export\s+(?:const\s+)?enum\s+([A-Za-z_]\w*)\s*\{([^}]*)\}""")
UNION_TYPE_RE = re.compile(r"""export\s+type\s+([A-Za-z_]\w*)\s*=\s*((?:\s*\|?\s*['"][^'"]+['"]\s*){2,})""")
CONST_ARRAY_RE = re.compile(r"""export\s+const\s+([A-Z][A-Z0-9_]+|[A-Za-z_]\w*(?:Options|Status|Statuses|Types|Roles|Steps|Stages|Labels))\s*=\s*\[([^\]]{3,600})\]\s*as\s+const""")
CONST_PARAM_RE = re.compile(r"""(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*(?::\s*\w+)?\s*=\s*(-?\d+(?:\.\d+)?|['"][^'"\n]{1,60}['"])\s*;?""")
TRANSITION_MAP_RE = re.compile(r"""(?:export\s+)?const\s+(\w*(?:[Tt]ransition|TRANSITION|[Aa]llowed|ALLOWED|[Nn]ext[Ss]t|NEXT_ST|[Ff]luxo|FLUXO|[Ww]orkflow|WORKFLOW)\w*)\s*(?::[^=]+)?=\s*\{""")
STATUS_WRITE_RE = re.compile(r"""\b(""" + STATUS_FIELDS + r""")\s*:\s*['"]([\w-]{2,40})['"]""", re.I)
STATUS_CMP_RE = re.compile(r"""\b(?:\w+\.)?(""" + STATUS_FIELDS + r""")\s*(?:===?|!==?)\s*['"]([\w-]{2,40})['"]""", re.I)
STATUS_EQ_RE = re.compile(r"""\.\s*(?:eq|neq|in)\s*\(\s*['"](""" + STATUS_FIELDS + r""")['"]\s*,\s*(?:\[\s*)?['"]([\w-]{2,40})['"]""", re.I)
ROLE_CHECK_RE = re.compile(r"""(?:role|roles|perfil|permiss\w*|isAdmin|is_admin|hasPermission|hasRole|can[A-Z]\w*|user_role|userRole|app_metadata\.\w+|user_metadata\.\w+)\s*(?:===|==|!==|!=|\.includes\(|\?\.includes\()\s*['"`]?([A-Za-z_]+)['"`]?""")
COMMENT_LINE_RE = re.compile(r"""(?://|#|\*)\s*(.{12,200})$""", re.M)
TOP_COMMENT_RE = re.compile(r"""\A\s*(?:/\*\*?([\s\S]{10,600}?)\*/|(?:(?://|#)[^\n]*\n){1,8}|\"\"\"([\s\S]{10,600}?)\"\"\")""")
CRON_RE = re.compile(r"""cron\.schedule\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]|schedule\s*[:=]\s*['"]([^'"]+)['"]""")
HOOK_USE_RE = re.compile(r"""^export\s+(?:default\s+)?(?:async\s+)?(?:function|const)\s+(use[A-Z]\w*)""", re.M)
CALC_FN_RE = re.compile(
    r"""(?:export\s+)?(?:async\s+)?(?:function\s+|const\s+)((?:[a-z]+)?(?:[Cc]alc|[Cc]ompute|[Tt]otal|[Pp]rice|[Pp]reco|[Vv]alor|[Dd]esconto|[Dd]iscount|[Tt]axa|[Tt]ax|[Ff]ee|[Jj]uros|[Cc]omiss|[Ff]rete|[Ss]hipping|[Ii]mposto|[Ss]aldo|[Bb]alance|[Pp]arcel|[Ii]nstallment|[Ss]core|[Rr]ank|[Ee]legiv|[Ee]ligib|[Pp]ode[A-Z]|[Cc]an[A-Z]|[Ss]hould[A-Z]|[Ii]s[A-Z]|[Vv]alid|[Aa]pply|[Aa]plicar|[Gg]erar|[Gg]enerate|[Rr]ound|[Aa]rredond|[Cc]onvert|[Ff]ormat(?:Money|Currency|Price|Valor))\w*)\s*(?:=\s*)?(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_]\w*))\s*(?::\s*[^={]+)?\s*(?:=>|\{)""")
CALC_METHOD_RE = re.compile(r"""^\s+(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*((?:calc|compute|total|preco|price|valor|desconto|discount|taxa|juros|comiss|frete|imposto|saldo|parcel|pode|can|should|valid|aplic|apply|gerar|generate|arredond|round)\w*)\s*\(([^)]*)\)\s*(?::\s*[\w<>\[\]| ]+)?\s*\{""", re.M | re.I)
DATE_MATH_RE = re.compile(
    r"""(add|sub)(Days|Hours|Minutes|Months|Weeks|Years|BusinessDays)\(\s*[^,]{1,60},\s*(\d+)|"""
    r"""interval\s+'(\d+\s+\w+)'|(?:expires?_?[Ii]n|expiresIn|ttl|maxAge|max_age|timeout|TIMEOUT|cooldown|retention|RETENTION)\s*[:=]\s*(\d+)|"""
    r"""(\d+)\s*\*\s*(?:24\s*\*\s*)?60\s*\*\s*(?:60|1000)|setTimeout\([^,]+,\s*(\d{4,})""")
PERCENT_RE = re.compile(r"""\*\s*(0\.\d{1,4}|\d{1,3}\s*/\s*100)\b|\b(\d{1,3}(?:\.\d+)?)\s*%""")
TEST_NAME_RE = re.compile(r"""\b(?:describe|it|test)(?:\.only|\.skip|\.todo|\.each\([^)]*\))?\(\s*[`'"]([^`'"]{3,200})[`'"]""")
WEBHOOK_EVENT_RE = re.compile(r"""case\s+['"]([a-z_]+(?:\.[a-z_]+)+)['"]|(?:event|evt|body|payload|data)\.(?:type|event|name|action|topic)\s*===?\s*['"]([\w.]+)['"]""")
SIDE_EFFECT_RE = re.compile(r"""\b(sendEmail|emails\.send|sendMail|sendSms|sendSMS|sendWhats\w*|sendNotification|sendPush|notify\w*|messages\.create|onesignal|fcm\.|expo\.sendPush|slack\.\w+|webhook\w*\.send|publish\(|enqueue\(|queue\.add|\.add\(\s*['"][\w-]+['"]|resend\.\w+\.send|stripe\.\w+\.create|mercadopago|asaas|invoke\()""")
PAGINATION_RE = re.compile(r"""\.(?:range|limit)\(\s*(\d+)""")


def op_from_chain(chain: str) -> str:
    ops = re.findall(r"\.\s*(select|insert|update|upsert|delete)\s*\(", chain)
    return ",".join(sorted(set(ops))) if ops else "ref"


def extract_zod(txt: str) -> list[dict]:
    out = []
    named_spans = []
    for m in ZOD_START_RE.finditer(txt):
        open_idx = m.end() - 1
        close = balanced(txt, open_idx)
        if close < 0:
            continue
        body = txt[open_idx + 1:close]
        # cadeia após o fechamento: .refine(...).transform(...)
        tail_end = close + 1
        tail = ""
        mm = re.match(r"((?:\s*\.\s*\w+\s*\()[\s\S]*)", txt[close + 1:close + 2000])
        if mm:
            # captura métodos encadeados até ponto-e-vírgula no nível 0
            seg, depth, i = txt[close + 1:close + 4000], 0, 0
            while i < len(seg):
                ch = seg[i]
                if ch == "(": depth += 1
                elif ch == ")": depth -= 1
                elif ch in ";\n" and depth == 0 and not re.match(r"\s*\.", seg[i + 1:i + 10]):
                    break
                i += 1
            tail = seg[:i]
        refines = [r for r in ZOD_REFINE_MSG_RE.findall(body + tail)]
        chain_ops = sorted(set(re.findall(r"\.(refine|superRefine|transform|pipe|catch|default|optional|nullable)\(", tail)))
        out.append({"name": m.group(1), "kind": m.group(2), "body": trunc(squash(body), 800),
                    "refines": refines[:10], "chain": chain_ops})
        named_spans.append((open_idx, close))
    for m in re.finditer(r"(?:zodResolver|export\s+default|resolver\s*:)\s*\(?\s*z\s*\.\s*(object)\s*\(", txt):
        open_idx = m.end() - 1
        if any(a <= open_idx <= b for a, b in named_spans):
            continue
        close = balanced(txt, open_idx)
        if close > 0:
            out.append({"name": "(inline)", "kind": "object", "body": trunc(squash(txt[open_idx + 1:close]), 800), "refines": [], "chain": []})
    return out[:30]


def extract_html_constraints(txt: str) -> list[dict]:
    out = []
    for attrs in HTML_INPUT_RE.findall(txt):
        name = re.search(r"""\b(?:name|id)\s*=\s*['"{]([\w.\-]+)""", attrs)
        cons = re.findall(r"""\b(required|readOnly|readonly|disabled|min|max|minLength|maxLength|minlength|maxlength|pattern|step|type|accept|multiple)(?:\s*=\s*(['"{][^'"}]*['"}]))?""", attrs)
        cons = [(k, v) for k, v in cons if k != "type" or v and re.search(r"email|number|tel|date|url|password", v)]
        if name and cons:
            out.append({"field": name.group(1), "rules": ", ".join(f"{k}{'=' + v.strip('{}\"' + chr(39)) if v else ''}" for k, v in cons)})
    return out[:40]


def analyze_code_file(p: Path, root: Path) -> dict | None:
    if p.suffix not in CODE_EXT or is_archived_sql(p, root):
        return None
    txt = read_text(p)
    if not txt:
        return None
    r = rel(p, root)
    info: dict = {"path": r, "lines": txt.count("\n") + 1, "is_test": is_test_file(r), "exports": [], "imports": [],
                  "tables": [], "table_cols": {}, "dyn_from": 0, "rpc": [], "invokes": [], "storage": [], "channels": [],
                  "external_urls": [], "env": [], "routes": [], "server_routes": [], "middleware_matcher": [],
                  "navigates": [], "errors": [], "zod": [], "rhf": [], "html_constraints": [], "enums": [], "params": [],
                  "transition_maps": [], "status_values": [], "role_checks": [], "guards": [], "rule_comments": [],
                  "doc": "", "hooks": [], "cron": [], "calc_fns": [], "temporal": [], "percents": [], "tests": [],
                  "webhook_events": [], "side_effects": [], "pagination": [], "uses_service_role": False}
    if p.suffix == ".py":
        info["exports"] = [f"{k} {n}" for k, n in PY_DEF_RE.findall(txt)][:60]
        info["errors"] += RAISE_PY_RE.findall(txt) + PY_HTTPEXC_RE.findall(txt)
    else:
        info["exports"] = [f"{k} {n}" for k, n in EXPORT_RE.findall(txt)][:60]
        d = EXPORT_DEFAULT_RE.search(txt)
        if d and not any(d.group(1) in e for e in info["exports"]):
            info["exports"].append(f"default {d.group(1)}")
        info["hooks"] = HOOK_USE_RE.findall(txt)
    info["imports"] = sorted(set(IMPORT_RE.findall(txt) + REQUIRE_RE.findall(txt)))[:80]
    for t, chain in SUPA_FROM_RE.findall(txt):
        info["tables"].append({"table": t, "op": op_from_chain(chain)})
        cols = set(c for op, c in FILTER_COL_RE.findall(chain) if "." not in c and op != "order")  # a.b = filtro em tabela embutida
        for sel in SELECT_COLS_RE.findall(chain):
            sel = re.sub(r"[\w:!.]+\s*\((?:[^()]|\([^()]*\))*\)", "", sel)  # remove embeds relacionais: clientes(nome)
            for c in re.split(r"\s*,\s*", sel):
                c = c.strip().split(":")[-1].split("!")[0].strip()
                if c and c != "*" and re.match(r"^[\w.]+$", c):
                    cols.add(c)
        if cols:
            info["table_cols"].setdefault(t, set()).update(cols)
    info["table_cols"] = {k: sorted(v) for k, v in info["table_cols"].items()}
    info["dyn_from"] = len(SUPA_FROM_DYN_RE.findall(txt))
    info["rpc"] = sorted(set(SUPA_RPC_RE.findall(txt)))
    info["invokes"] = sorted(set(SUPA_INVOKE_RE.findall(txt)))
    info["storage"] = sorted(set(SUPA_STORAGE_RE.findall(txt)))
    info["channels"] = sorted(set(SUPA_CHANNEL_RE.findall(txt)))[:10]
    info["external_urls"] = sorted(set(re.sub(r"/[^/]*$", "/…", u) if u.count("/") > 3 else u for u in FETCH_URL_RE.findall(txt)))[:20]
    info["env"] = sorted({g for m in ENV_RE.findall(txt) for g in m if g})
    info["uses_service_role"] = bool(re.search(r"SERVICE_ROLE|serviceRole|service_role", txt))
    for tag in ROUTE_TAG_RE.findall(txt):
        pm = ROUTE_PATH_RE.search(tag)
        if pm:
            cm = ROUTE_COMP_RE.search(tag)
            g = GUARD_IN_TAG_RE.search(tag)
            roles = ROLES_PROP_RE.search(g.group(2)) if g else None
            comp = cm.group(1) if cm else ""
            if g and comp == g.group(1):
                inner = re.search(r"<" + re.escape(g.group(1)) + r"\b[^>]*>\s*<([A-Z]\w*)", tag)
                comp = inner.group(1) if inner else comp
            info["routes"].append({"path": pm.group(1), "component": comp,
                                   "guard": g.group(1) if g else "", "roles": re.findall(r"['\"]([\w-]+)['\"]", roles.group(1)) if roles else []})
    for path, el, comp in ROUTE_OBJ_RE.findall(txt):
        info["routes"].append({"path": path, "component": el or comp or "", "guard": "", "roles": []})
    # guards usados fora de <Route>
    for g in GUARD_IN_TAG_RE.findall(txt):
        info["guards"].append(g[0])
    for mm in MIDDLEWARE_MATCHER_RE.findall(txt):
        info["middleware_matcher"] += re.findall(r"['\"]([^'\"]+)['\"]", mm)
    info["server_routes"] = [{"method": m.upper(), "path": pth} for m, pth in SERVER_ROUTE_RE.findall(txt)]
    ctrl = re.search(r"""@Controller\(\s*['"]([^'"]*)['"]""", txt)
    for m, pth in re.findall(r"""@(Get|Post|Put|Patch|Delete)\(\s*(?:['"]([^'"]*)['"])?""", txt):
        info["server_routes"].append({"method": m.upper(), "path": "/" + "/".join(x.strip("/") for x in ((ctrl.group(1) if ctrl else ""), pth) if x)})
    if p.suffix == ".py":
        info["server_routes"] += [{"method": m.upper(), "path": pth} for m, pth in PY_ROUTE_RE.findall(txt)]
    info["navigates"] = sorted(set(NAVIGATE_RE.findall(txt)))[:30]
    errs = THROW_RE.findall(txt) + TOAST_ERR_RE.findall(txt) + TOAST_VARIANT_RE.findall(txt) + RESP_ERR_RE.findall(txt) + RESP_ERR2_RE.findall(txt)
    info["errors"] = sorted(set(e for e in info["errors"] + errs if not re.search(r"(sucesso|success|salvo|saved|criado|created)", e, re.I)))[:40]
    if p.suffix in (".ts", ".tsx", ".js", ".jsx", ".mjs"):
        info["zod"] = extract_zod(txt)
        info["rhf"] = [{"field": f, "rules": squash(rules)[:200]} for f, rules in RHF_REGISTER_RE.findall(txt) + RHF_RULES_RE.findall(txt)][:40]
        info["html_constraints"] = extract_html_constraints(txt)
    for name, body in ENUM_RE.findall(txt):
        info["enums"].append({"name": name, "values": trunc(squash(body), 300)})
    for name, body in UNION_TYPE_RE.findall(txt):
        info["enums"].append({"name": name, "values": " | ".join(re.findall(r"""['"]([^'"]+)['"]""", body))})
    for name, body in CONST_ARRAY_RE.findall(txt):
        info["enums"].append({"name": name, "values": trunc(squash(body), 300)})
    for name, val in CONST_PARAM_RE.findall(txt):
        if not re.search(r"(KEY|TOKEN|SECRET|PASSWORD|URL|PATH|QUERY|STORAGE|ROUTE|ENDPOINT|PREFIX|SUFFIX|NAME|ID$|REGEX|COLOR|CLASS|ICON)", name):
            info["params"].append({"name": name, "value": val})
    for m in TRANSITION_MAP_RE.finditer(txt):
        close = balanced(txt, m.end() - 1, "{", "}")
        if close > 0:
            info["transition_maps"].append({"name": m.group(1), "body": trunc(squash(txt[m.end():close]), 700)})
    if not info["is_test"] and is_app_code(r):
        for f, v in STATUS_WRITE_RE.findall(txt): info["status_values"].append({"field": f.lower(), "value": v, "kind": "escreve"})
        for f, v in STATUS_CMP_RE.findall(txt): info["status_values"].append({"field": f.lower(), "value": v, "kind": "compara"})
        for f, v in STATUS_EQ_RE.findall(txt): info["status_values"].append({"field": f.lower(), "value": v, "kind": "filtra"})
        for sm in re.finditer(r"switch\s*\(\s*(?:[\w.?]+\.)?(""" + STATUS_FIELDS + r""")\s*\)\s*\{""", txt, re.I):
            close = balanced(txt, sm.end() - 1, "{", "}")
            for v in re.findall(r"case\s+['\"]([\w-]{2,40})['\"]", txt[sm.end():close if close > 0 else sm.end() + 2000]):
                info["status_values"].append({"field": sm.group(1).lower(), "value": v, "kind": "compara"})
    info["role_checks"] = sorted(set(ROLE_CHECK_RE.findall(txt) + re.findall(r"""\b(?:hasRole|has_role|hasPermission|checkRole|requireRole|isRole|allowRoles?|withRole)\(\s*(?:[^,)]*,\s*)?['"](\w+)['"]""", txt)))[:20]
    for c in COMMENT_LINE_RE.findall(txt):
        c = c.strip()
        if RULE_KEYWORDS.search(c) and not c.startswith(("eslint", "@ts", "prettier", "TODO:", "http", "import")) and "://" not in c:
            info["rule_comments"].append(trunc(c, 200))
    info["rule_comments"] = info["rule_comments"][:15]
    tc = TOP_COMMENT_RE.match(txt)
    if tc:
        raw = tc.group(1) or tc.group(2) or tc.group(0)
        raw = re.sub(r"^\s*(?:\*|//|#)\s?", "", raw, flags=re.M)
        info["doc"] = trunc(squash(raw), 300)
    for m in (CRON_RE.findall(txt) if p.suffix != ".sql" else []):
        info["cron"].append(" ".join(x for x in m if x))
    for m in CALC_FN_RE.finditer(txt):
        name = m.group(1)
        if name.startswith(("use", "is", "set", "get", "handle", "on", "render", "format")) and not re.search(r"(Money|Currency|Price|Valor|Eligib|Elegiv)", name):
            continue
        start = m.end()
        brace = start - 1 if txt[start - 1] == "{" else (txt.find("{", start) if 0 <= txt.find("{", start) - start <= 3 else -1)
        if brace >= 0:
            end = balanced(txt, brace, "{", "}")
            snippet = txt[brace + 1:end] if end > 0 else txt[start:start + 450]
        else:
            nl = txt.find("\n", start)
            snippet = txt[start:nl if nl > 0 else start + 300]
        info["calc_fns"].append({"name": name, "params": squash(m.group(2) or m.group(3) or "")[:120],
                                 "body": trunc(squash(snippet), 500)})
    for m in CALC_METHOD_RE.finditer(txt):
        if any(c["name"] == m.group(1) for c in info["calc_fns"]):
            continue
        end = balanced(txt, m.end() - 1, "{", "}")
        info["calc_fns"].append({"name": m.group(1), "params": squash(m.group(2))[:120], "body": trunc(squash(txt[m.end():end] if end > 0 else txt[m.end():m.end() + 400]), 500)})
    info["calc_fns"] = info["calc_fns"][:25]
    for m in DATE_MATH_RE.finditer(txt):
        line_start = txt.rfind("\n", 0, m.start()) + 1
        line = txt[line_start: txt.find("\n", m.end()) if txt.find("\n", m.end()) > 0 else None]
        info["temporal"].append(trunc(squash(line), 160))
    info["temporal"] = sorted(set(info["temporal"]))[:20]
    for m in (PERCENT_RE.finditer(txt) if p.suffix != ".sql" and not info["is_test"] else []):
        line_start = txt.rfind("\n", 0, m.start()) + 1
        line = txt[line_start: txt.find("\n", m.end()) if txt.find("\n", m.end()) > 0 else None]
        if not re.search(r"""(width|height|opacity|className|style|%\)|translate|scale|top:|left:|right:|bottom:|['"`][^'"`]*\d+%[^'"`]*['"`])""", line):
            info["percents"].append(trunc(squash(line), 160))
    info["percents"] = sorted(set(info["percents"]))[:15]
    if info["is_test"]:
        info["tests"] = TEST_NAME_RE.findall(txt)[:80]
    info["webhook_events"] = sorted({a or b for a, b in WEBHOOK_EVENT_RE.findall(txt)})[:40]
    info["side_effects"] = sorted(set(SIDE_EFFECT_RE.findall(txt)))[:15]
    info["pagination"] = sorted(set(PAGINATION_RE.findall(txt)))[:5]
    return info


# --------------------------------------------------------------------------- #
# 4. Schema SQL (migrations / schema.sql / prisma / database.types.ts)
# --------------------------------------------------------------------------- #
SQL_CREATE_TABLE_RE = re.compile(r"create\s+(?:unlogged\s+|temp(?:orary)?\s+|global\s+|local\s+)*table\s+(?:if\s+not\s+exists\s+)?(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s*\(", re.I)
SQL_ALTER_ADD_RE = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?\"?(\w+)\"?\s+([^,;]+)", re.I)
SQL_ALTER_ADD_CONSTRAINT_RE = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s+add\s+constraint\s+\"?(\w+)\"?\s+([^;]+);", re.I)
SQL_ALTER_COL_RE = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s+alter\s+(?:column\s+)?\"?(\w+)\"?\s+(set\s+not\s+null|drop\s+not\s+null|set\s+default\s+[^,;]+|drop\s+default|(?:set\s+data\s+)?type\s+[^,;]+)", re.I)
SQL_ALTER_DROP_COL_RE = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s+drop\s+column\s+(?:if\s+exists\s+)?\"?(\w+)\"?", re.I)
SQL_DROP_TABLE_RE = re.compile(r"drop\s+table\s+(?:if\s+exists\s+)?(?:\"?(\w+)\"?\.)?\"?(\w+)\"?", re.I)
SQL_POLICY_RE = re.compile(
    r"create\s+policy\s+\"?([^\"\n]+?)\"?\s+on\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s*(?:as\s+(permissive|restrictive)\s*)?(?:for\s+(select|insert|update|delete|all)\s*)?(?:to\s+([\w,\s]+?)\s*)?(?:using\s*\(((?:[^()]|\([^()]*(?:\([^()]*\)[^()]*)*\))*)\)\s*)?(?:with\s+check\s*\(((?:[^()]|\([^()]*(?:\([^()]*\)[^()]*)*\))*)\)\s*)?;",
    re.I)
SQL_DROP_POLICY_RE = re.compile(r"drop\s+policy\s+(?:if\s+exists\s+)?\"?([^\"\n]+?)\"?\s+on\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?", re.I)
SQL_RLS_RE = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s+(enable|disable|force|no\s+force)\s+row\s+level\s+security", re.I)
SQL_TRIGGER_RE = re.compile(r"create\s+(?:or\s+replace\s+)?trigger\s+\"?(\w+)\"?\s+(before|after|instead\s+of)\s+([\w\s|]+?)\s+on\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?([\s\S]*?)execute\s+(?:function|procedure)\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?", re.I)
SQL_FUNC_RE = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s*\(([^)]*)\)\s*returns\s+((?:setof\s+)?[\w\s\[\]\.]+?)\s+(?=language|as|security|stable|volatile|immutable)", re.I)
SQL_FUNC_FULL_RE = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+(?:\"?\w+\"?\.)?\"?(\w+)\"?\s*\(([\s\S]*?)\$([\w]*)\$([\s\S]*?)\$\3\$([^;]*);", re.I)
SQL_ENUM_RE = re.compile(r"create\s+type\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s+as\s+enum\s*\(([^)]*)\)", re.I)
SQL_ENUM_ADD_RE = re.compile(r"alter\s+type\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'([^']+)'", re.I)
SQL_INDEX_RE = re.compile(r"create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?\"?(\w+)\"?\s+on\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s*(?:using\s+\w+\s*)?\(([^)]*)\)(\s*where\s+[^;]+)?", re.I)
SQL_CRON_RE = re.compile(r"cron\.schedule\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(?:\$\$([\s\S]*?)\$\$|'([^']*)')", re.I)
SQL_COMMENT_RE = re.compile(r"comment\s+on\s+(table|column|function|type)\s+([\w.\"]+)\s+is\s+'((?:[^']|'')*)'", re.I)
SQL_VIEW_RE = re.compile(r"create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(?:recursive\s+)?view\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s*(?:\([^)]*\))?\s*(?:with\s*\([^)]*\)\s*)?as\s+([\s\S]*?);", re.I)
SQL_FK_RE = re.compile(r"references\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s*(?:\(\s*\"?(\w+)\"?\s*\))?\s*(on\s+delete\s+(?:cascade|set\s+null|restrict|no\s+action|set\s+default))?", re.I)
SQL_CHECK_RE = re.compile(r"check\s*\(((?:[^()]|\([^()]*\))*)\)", re.I)
SQL_GENERATED_RE = re.compile(r"generated\s+always\s+as\s*\(((?:[^()]|\([^()]*\))*)\)\s*stored", re.I)
SQL_GRANT_RE = re.compile(r"(grant|revoke)\s+([\w\s,]+?)\s+on\s+(?:(?:all\s+)?(table|tables|function|functions|sequence|sequences)\s+(?:in\s+schema\s+)?)?(?:\"?(\w+)\"?\.)?\"?(\w+)\"?(?:\([^)]*\))?\s+(?:to|from)\s+([\w,\s]+?)\s*;", re.I)
SQL_RAISE_RE = re.compile(r"raise\s+(exception|notice|warning)\s+'((?:[^']|'')+)'", re.I)
SQL_INSERT_RE = re.compile(r"insert\s+into\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s*\(([^)]*)\)\s*values\s*([\s\S]*?);", re.I)


def split_columns(body: str) -> list[str]:
    parts, depth, cur, in_str = [], 0, [], False
    for ch in body:
        if ch == "'":
            in_str = not in_str
        if not in_str:
            if ch == "(": depth += 1
            elif ch == ")": depth -= 1
        if ch == "," and depth == 0 and not in_str:
            parts.append("".join(cur).strip()); cur = []
        else:
            cur.append(ch)
    if cur:
        parts.append("".join(cur).strip())
    return [p for p in parts if p]


def tkey(sch: str | None, name: str) -> str:
    return f"{sch}.{name}" if sch and sch.lower() != "public" else name


def parse_column(cname: str, ctype: str, src: str) -> dict:
    fk = SQL_FK_RE.search(ctype)
    gen = SQL_GENERATED_RE.search(ctype)
    return {"name": cname, "type": trunc(squash(ctype), 200),
            "fk": (f"{fk.group(2)}.{fk.group(3) or 'id'}" + (f" {squash(fk.group(4))}" if fk.group(4) else "")) if fk else "",
            "generated": squash(gen.group(1)) if gen else "", "src": src}


def split_sql_statements(txt: str) -> list[str]:
    """Divide em statements no ';' de nível superior, respeitando aspas simples e dollar-quoting ($$, $tag$)."""
    out, cur, i, n = [], [], 0, len(txt)
    in_sq = False
    dollar = None
    while i < n:
        ch = txt[i]
        if dollar:
            if txt.startswith(dollar, i):
                cur.append(dollar); i += len(dollar); dollar = None; continue
            cur.append(ch); i += 1; continue
        if in_sq:
            cur.append(ch)
            if ch == "'":
                in_sq = False
            i += 1; continue
        if ch == "'":
            in_sq = True; cur.append(ch); i += 1; continue
        if ch == "$":
            m = re.match(r"\$[A-Za-z_]*\$", txt[i:i + 64])
            if m:
                dollar = m.group(0); cur.append(dollar); i += len(dollar); continue
        if ch == ";":
            st = "".join(cur).strip()
            if st:
                out.append(st + ";")
            cur = []; i += 1; continue
        cur.append(ch); i += 1
    st = "".join(cur).strip()
    if st:
        out.append(st + ";")
    return out


SQL_RENAME_COL_RE = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s+rename\s+(?:column\s+)?\"?(\w+)\"?\s+to\s+\"?(\w+)\"?", re.I)
SQL_RENAME_TABLE_RE = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s+rename\s+to\s+\"?(\w+)\"?", re.I)
SQL_DROP_CONSTRAINT_RE = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s+drop\s+constraint\s+(?:if\s+exists\s+)?\"?(\w+)\"?", re.I)
SQL_POLICY_HEAD_RE = re.compile(r"create\s+policy\s+(?:\"([^\"]+)\"|(\w+))\s+on\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s*(?:as\s+(permissive|restrictive)\s*)?(?:for\s+(select|insert|update|delete|all)\s*)?(?:to\s+([\w\s,]+?)\s*)?(?=using|with\s+check|;|$)", re.I)


def parse_policy(st: str) -> dict | None:
    m = SQL_POLICY_HEAD_RE.match(st)
    if not m:
        return None
    pname = m.group(1) or m.group(2)
    rest = st[m.end():]
    def clause(kw: str) -> str:
        km = re.search(kw + r"\s*\(", rest, re.I)
        if not km:
            return ""
        close = balanced(rest, km.end() - 1)
        return squash(rest[km.end():close]) if close > 0 else squash(rest[km.end():])
    return {"name": pname.strip(), "table": tkey(m.group(3), m.group(4)), "cmd": (m.group(6) or "ALL").upper(),
            "roles": squash(m.group(7) or "public"), "mode": (m.group(5) or "permissive").lower(),
            "using": trunc(clause(r"\busing"), 300), "check": trunc(clause(r"with\s+check"), 300)}


def new_table(src: str) -> dict:
    return {"columns": [], "constraints": [], "src": src, "comment": "", "origin": "migration"}


def parse_sql_schema(root: Path, files: list[Path]) -> dict:
    sql_files = sorted(
        [f for f in files if f.suffix == ".sql" and not is_archived_sql(f, root)
         and ("migration" in rel(f, root).lower() or "schema" in f.name.lower()
              or rel(f, root).startswith(("supabase/", "db/", "sql/", "database/", "prisma/")))],
        key=lambda f: rel(f, root))
    schema: dict = {"tables": {}, "policies": [], "triggers": [], "functions": {}, "enums": {}, "indexes": [], "cron_jobs": [],
                    "views": {}, "sources": [rel(f, root) for f in sql_files], "rls": {}, "grants": [], "raises": [],
                    "seed": [], "comments": {}, "types_file": ""}
    T = schema["tables"]
    for f in sql_files:
        src = rel(f, root)
        is_seed = "seed" in f.name.lower()
        txt = read_text(f, MAX_SQL_BYTES)
        txt_nc = strip_sql_comments(txt)
        if is_seed:
            for sch, name, cols, vals in SQL_INSERT_RE.findall(txt_nc):
                schema["seed"].append({"table": tkey(sch, name), "columns": squash(cols), "values": trunc(squash(vals), 400), "src": src})
            continue
        for job, sched, body, body2 in SQL_CRON_RE.findall(txt):
            schema["cron_jobs"].append({"job": job, "schedule": sched, "body": trunc(squash(body or body2), 300), "src": src})
        for kind, target, comment in SQL_COMMENT_RE.findall(txt):
            tgt = target.replace('"', "").replace("public.", "")
            schema["comments"][f"{kind.lower()}:{tgt}"] = comment.replace("''", "'")
        for st in split_sql_statements(txt_nc):
            low = st.lower().lstrip()
            # ---- CREATE TABLE
            m = SQL_CREATE_TABLE_RE.match(st)
            if m:
                close = balanced(st, m.end() - 1)
                if close > 0:
                    key = tkey(m.group(1), m.group(2))
                    t = new_table(src)
                    for part in split_columns(st[m.end():close]):
                        pl = part.lower()
                        if pl.startswith(("constraint", "primary key", "foreign key", "unique", "check", "exclude", "like")):
                            t["constraints"].append(trunc(squash(part), 300))
                        else:
                            cm = re.match(r"\"?(\w+)\"?\s+(.+)", part, re.S)
                            if cm:
                                t["columns"].append(parse_column(cm.group(1), cm.group(2), src))
                    T[key] = t
                continue
            if low.startswith("alter table"):
                m = SQL_ALTER_ADD_CONSTRAINT_RE.match(st)
                if m:
                    key = tkey(m.group(1), m.group(2)); t = T.setdefault(key, new_table(src))
                    body = m.group(4)
                    t["constraints"].append(trunc(f"constraint {m.group(3)} {squash(body)}", 300))
                    fkm = re.search(r"foreign\s+key\s*\(\s*\"?(\w+)\"?\s*\)\s*" + SQL_FK_RE.pattern, body, re.I)
                    if fkm:
                        for c in t["columns"]:
                            if c["name"] == fkm.group(1) and not c["fk"]:
                                c["fk"] = f"{fkm.group(3)}.{fkm.group(4) or 'id'}" + (f" {squash(fkm.group(5))}" if fkm.group(5) else "")
                    continue
                m = SQL_DROP_CONSTRAINT_RE.match(st)
                if m:
                    key = tkey(m.group(1), m.group(2))
                    if key in T:
                        T[key]["constraints"] = [c for c in T[key]["constraints"] if not re.match(rf"constraint\s+{re.escape(m.group(3))}\b", c, re.I)]
                    continue
                m = SQL_ALTER_ADD_RE.match(st)
                if m and m.group(3).lower() != "constraint":
                    key = tkey(m.group(1), m.group(2)); t = T.setdefault(key, new_table(src))
                    if not any(c["name"] == m.group(3) for c in t["columns"]):
                        t["columns"].append(parse_column(m.group(3), m.group(4), src))
                    continue
                m = SQL_ALTER_COL_RE.match(st)
                if m:
                    t = T.get(tkey(m.group(1), m.group(2)))
                    if t:
                        for c in t["columns"]:
                            if c["name"] == m.group(3):
                                a = m.group(4); al = a.lower()
                                if al.startswith("set not null") and "not null" not in c["type"].lower(): c["type"] += " not null"
                                elif al.startswith("drop not null"): c["type"] = re.sub(r"\s*not null", "", c["type"], flags=re.I)
                                elif al.startswith("set default"): c["type"] = re.sub(r"\s*default\s+\S+(\([^)]*\))?", "", c["type"], flags=re.I) + " " + squash(a)
                                elif al.startswith("drop default"): c["type"] = re.sub(r"\s*default\s+\S+(\([^)]*\))?", "", c["type"], flags=re.I)
                                elif "type" in al: c["type"] = squash(re.sub(r"^(set\s+data\s+)?type\s+", "", a, flags=re.I)) + " " + re.sub(r"^\S+(\([^)]*\))?", "", c["type"]).strip()
                                c["type"] = trunc(c["type"], 200)
                    continue
                m = SQL_ALTER_DROP_COL_RE.match(st)
                if m:
                    key = tkey(m.group(1), m.group(2))
                    if key in T:
                        T[key]["columns"] = [c for c in T[key]["columns"] if c["name"] != m.group(3)]
                    continue
                m = SQL_RENAME_TABLE_RE.match(st)
                if m:
                    key = tkey(m.group(1), m.group(2))
                    if key in T:
                        T[tkey(m.group(1), m.group(3))] = T.pop(key)
                        schema["rls"][tkey(m.group(1), m.group(3))] = schema["rls"].pop(key, "não encontrado")
                        for pol in schema["policies"]:
                            if pol["table"] == key: pol["table"] = tkey(m.group(1), m.group(3))
                    continue
                m = SQL_RENAME_COL_RE.match(st)
                if m:
                    t = T.get(tkey(m.group(1), m.group(2)))
                    if t:
                        for c in t["columns"]:
                            if c["name"] == m.group(3): c["name"] = m.group(4)
                    continue
                m = SQL_RLS_RE.match(st)
                if m:
                    a = m.group(3).lower(); key = tkey(m.group(1), m.group(2))
                    schema["rls"][key] = {"enable": "enabled", "disable": "disabled", "force": "forced"}.get(a, schema["rls"].get(key, "enabled"))
                    continue
                continue
            m = SQL_DROP_TABLE_RE.match(st)
            if m:
                T.pop(tkey(m.group(1), m.group(2)), None); continue
            if low.startswith("create policy"):
                pol = parse_policy(st)
                if pol:
                    schema["policies"] = [p for p in schema["policies"] if not (p["name"] == pol["name"] and p["table"] == pol["table"])]
                    schema["policies"].append({**pol, "src": src})
                continue
            m = SQL_DROP_POLICY_RE.match(st)
            if m:
                key = tkey(m.group(2), m.group(3))
                schema["policies"] = [p for p in schema["policies"] if not (p["name"] == m.group(1).strip() and p["table"] == key)]
                continue
            m = SQL_TRIGGER_RE.match(st)
            if m:
                name, when, events, sch, tname, mid, fsch, fn = m.groups()
                cond = re.search(r"when\s*\(((?:[^()]|\([^()]*\))*)\)", mid, re.I)
                schema["triggers"] = [t for t in schema["triggers"] if not (t["name"] == name and t["table"] == tkey(sch, tname))]
                schema["triggers"].append({"name": name, "when": f"{when.upper()} {squash(events).upper()}", "table": tkey(sch, tname), "function": fn,
                                           "condition": squash(cond.group(1)) if cond else "", "each": "row" if re.search(r"for\s+each\s+row", mid, re.I) else "statement", "src": src})
                continue
            m = re.match(r"drop\s+trigger\s+(?:if\s+exists\s+)?\"?(\w+)\"?\s+on\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?", st, re.I)
            if m:
                schema["triggers"] = [t for t in schema["triggers"] if not (t["name"] == m.group(1) and t["table"] == tkey(m.group(2), m.group(3)))]
                continue
            m = SQL_FUNC_FULL_RE.match(st)
            if m:
                name, head, tag, body, tail = m.groups()
                full_head = head + tail
                ret = re.search(r"returns\s+((?:setof\s+)?[\w\[\]\.]+(?:\s*\([^)]*\))?)", full_head, re.I)
                lang = re.search(r"language\s+(\w+)", full_head, re.I)
                args = re.match(r"([^)]*)\)", head)
                schema["functions"][name] = {
                    "args": trunc(squash(args.group(1)) if args else "", 200), "returns": ret.group(1).strip() if ret else "?",
                    "lang": (lang.group(1) if lang else "").lower(), "src": src,
                    "security_definer": bool(re.search(r"security\s+definer", full_head, re.I)),
                    "search_path": bool(re.search(r"set\s+search_path", full_head, re.I)),
                    "body": trunc(squash(body), 700),
                    "raises": [squash(x) for k, x in SQL_RAISE_RE.findall(body) if k.lower() == "exception"][:10],
                    "tables": sorted(set(re.findall(r"\b(?:from|into|update|join)\s+(?:public\.)?\"?([a-z_][a-z0-9_]*)\"?", body, re.I)) - {"select", "the", "new", "old"}),
                }
                schema["raises"] = [r for r in schema["raises"] if r["function"] != name]
                for k, msg in SQL_RAISE_RE.findall(body):
                    if k.lower() == "exception":
                        schema["raises"].append({"function": name, "msg": squash(msg), "src": src})
                continue
            m = re.match(r"drop\s+function\s+(?:if\s+exists\s+)?(?:\"?\w+\"?\.)?\"?(\w+)\"?", st, re.I)
            if m:
                schema["functions"].pop(m.group(1), None); continue
            m = SQL_ENUM_RE.match(st)
            if m:
                schema["enums"][m.group(2)] = [v.strip().strip("'") for v in m.group(3).split(",") if v.strip()]; continue
            m = SQL_ENUM_ADD_RE.match(st)
            if m:
                schema["enums"].setdefault(m.group(2), [])
                if m.group(3) not in schema["enums"][m.group(2)]:
                    schema["enums"][m.group(2)].append(m.group(3))
                continue
            m = re.match(r"alter\s+type\s+(?:\"?(\w+)\"?\.)?\"?(\w+)\"?\s+rename\s+value\s+'([^']+)'\s+to\s+'([^']+)'", st, re.I)
            if m and m.group(2) in schema["enums"]:
                schema["enums"][m.group(2)] = [m.group(4) if v == m.group(3) else v for v in schema["enums"][m.group(2)]]; continue
            m = SQL_INDEX_RE.match(st)
            if m:
                uniq, name, sch, tname, icols, where = m.groups()
                schema["indexes"].append({"name": name, "table": tkey(sch, tname), "columns": squash(icols), "unique": bool(uniq), "where": squash(where or ""), "src": src}); continue
            m = SQL_VIEW_RE.match(st)
            if m:
                schema["views"][tkey(m.group(1), m.group(2))] = {"body": trunc(squash(m.group(3)), 600), "src": src}; continue
            m = SQL_GRANT_RE.match(st)
            if m:
                kind, privs, objkind, sch, obj, roles = m.groups()
                schema["grants"].append({"kind": kind.lower(), "privs": squash(privs).lower(), "object": tkey(sch, obj), "objkind": (objkind or "table").lower(), "roles": squash(roles), "src": src}); continue
        for key, t in T.items():
            c = schema["comments"].get(f"table:{key}")
            if c: t["comment"] = c
    # Prisma
    for f in files:
        if f.name == "schema.prisma":
            txt = read_text(f)
            for name, body in re.findall(r"model\s+(\w+)\s*\{([^}]*)\}", txt):
                cols, cons = [], []
                for line in body.strip().splitlines():
                    line = line.strip()
                    if not line or line.startswith("//"):
                        continue
                    if line.startswith("@@"):
                        cons.append(line); continue
                    parts = line.split()
                    if len(parts) >= 2:
                        rel_m = re.search(r"@relation\([^)]*fields:\s*\[(\w+)\][^)]*references:\s*\[(\w+)\]", line)
                        cols.append({"name": parts[0], "type": " ".join(parts[1:])[:200], "fk": f"{parts[1].rstrip('?[]')}.{rel_m.group(2)}" if rel_m else "", "generated": "", "src": rel(f, root)})
                schema["tables"][name] = {"columns": cols, "constraints": cons, "src": rel(f, root), "comment": "", "origin": "prisma"}
            for name, body in re.findall(r"enum\s+(\w+)\s*\{([^}]*)\}", txt):
                schema["enums"][name] = [v.strip() for v in body.strip().splitlines() if v.strip() and not v.strip().startswith("//")]
            schema["sources"].append(rel(f, root))
    # database.types.ts (Supabase gen types) — fonte quando migrations não têm a tabela
    for f in files:
        if f.name in ("types.ts", "database.types.ts", "database.ts", "supabase.ts") and "Tables:" in read_text(f) and "Row:" in read_text(f):
            txt = read_text(f)
            schema["types_file"] = rel(f, root)
            for name, row in re.findall(r"\n\s+(\w+):\s*\{\s*\n\s*Row:\s*\{([^}]*)\}", txt):
                cols = []
                for line in row.strip().splitlines():
                    cm = re.match(r"\s*(\w+)\??:\s*(.+?)\s*;?$", line)
                    if cm:
                        cols.append({"name": cm.group(1), "type": cm.group(2)[:120] + ("" if "null" in cm.group(2) else " not null"), "fk": "", "generated": "", "src": rel(f, root)})
                if name not in schema["tables"]:
                    schema["tables"][name] = {"columns": cols, "constraints": [], "src": rel(f, root), "comment": "", "origin": "types.ts"}
                else:
                    known = {c["name"] for c in schema["tables"][name]["columns"]}
                    for c in cols:
                        if c["name"] not in known:
                            schema["tables"][name]["columns"].append(c)
            for rels in re.findall(r"Relationships:\s*\[([\s\S]*?)\n\s{8}\]", txt):
                for fcols, rt, rcols in re.findall(r"columns:\s*\[\s*\"(\w+)\"\s*\][\s\S]*?referencedRelation:\s*\"(\w+)\"[\s\S]*?referencedColumns:\s*\[\s*\"(\w+)\"\s*\]", rels):
                    pass  # ligação tabela→coluna exige contexto do bloco; FK por migrations é a fonte principal
            def block(label: str) -> str:
                bm = re.search(label + r"\s*:\s*\{", txt)
                if not bm:
                    return ""
                end = balanced(txt, bm.end() - 1, "{", "}")
                return txt[bm.end():end] if end > 0 else ""
            for name, vals in re.findall(r"(\w+):\s*((?:\s*\|?\s*\"[^\"]+\")+)", block("Enums")):
                if name not in schema["enums"]:
                    schema["enums"][name] = re.findall(r"\"([^\"]+)\"", vals)
            fb = block("Functions")
            if fb:
                for name in re.findall(r"\n\s+(\w+):\s*\{", fb):
                    schema["functions"].setdefault(name, {"args": "", "returns": "?", "lang": "", "src": rel(f, root), "security_definer": False, "search_path": False, "body": "", "raises": [], "tables": []})
            schema["sources"].append(rel(f, root))
            break
    return schema


# --------------------------------------------------------------------------- #
# 4b. Resolução de imports internos (página → hook → serviço → tabela)
# --------------------------------------------------------------------------- #
EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".vue", ".svelte")


def make_resolver(code: dict[str, dict], ts_paths: dict[str, str]):
    index = set(code)
    def resolve(from_file: str, spec: str) -> str | None:
        if spec.startswith((".", "/")):
            base = os.path.normpath(os.path.join(os.path.dirname(from_file), spec)).replace("\\", "/") if spec.startswith(".") else spec.lstrip("/")
        else:
            hit = next((spec.replace(a, b, 1) for a, b in ts_paths.items() if spec.startswith(a)), None)
            if hit is None:
                return None
            base = hit
        base = re.sub(r"\.(ts|tsx|js|jsx|mjs)$", "", base)
        for cand in [base] + [base + e for e in EXTS] + [base + "/index" + e for e in EXTS]:
            if cand in index:
                return cand
        return None
    return resolve


def transitive_deps(start: str, code: dict[str, dict], resolve, depth: int = 4) -> set[str]:
    seen, frontier = set(), {start}
    for _ in range(depth):
        nxt = set()
        for f in frontier:
            for spec in code.get(f, {}).get("imports", []):
                t = resolve(f, spec)
                if t and t not in seen and t != start:
                    seen.add(t); nxt.add(t)
        frontier = nxt
        if not frontier:
            break
    return seen


def detect_ts_paths(root: Path) -> dict[str, str]:
    """Aliases de tsconfig (@/* → src/*). Fallback: @/ e ~/ → src/."""
    paths = {}
    for name in ("tsconfig.json", "tsconfig.app.json", "jsconfig.json"):
        p = root / name
        if p.exists():
            txt = re.sub(r"^\s*//[^\n]*|^\s*/\*[\s\S]*?\*/", "", read_text(p), flags=re.M)  # não tocar em "@/*"
            m = re.search(r'"paths"\s*:\s*\{([\s\S]*?)\}', txt)
            base = re.search(r'"baseUrl"\s*:\s*"([^"]*)"', txt)
            base_dir = (base.group(1).strip("./") + "/") if base and base.group(1).strip("./") else ""
            if m:
                for alias, target in re.findall(r'"([^"]+)"\s*:\s*\[\s*"([^"]+)"', m.group(1)):
                    a = alias.replace("*", ""); t = target.replace("*", "").lstrip("./")
                    paths[a] = (base_dir + t) if not t.startswith(base_dir) else t
            if paths:
                break
    for a in ("@/", "~/"):
        paths.setdefault(a, "src/")
    return paths


# --------------------------------------------------------------------------- #
# 5. Funcionalidades
# --------------------------------------------------------------------------- #
def next_route(seg: str) -> str:
    seg = re.sub(r"(^|/)@\w+(?=/|$)", r"\1", seg)      # parallel routes @slot
    seg = re.sub(r"\([^)]*\)/?", "", seg)                # grupos (auth) e intercepting (.)
    return "/" + re.sub(r"/+", "/", seg).strip("/")


def detect_features(root: Path, files: list[Path], code: dict[str, dict], stack: dict) -> dict:
    is_next = "next" in stack["deps"]
    is_nuxt = "nuxt" in stack["deps"] or (root / "nuxt.config.ts").exists() or (root / "nuxt.config.js").exists()
    resolver = make_resolver(code, detect_ts_paths(root))
    feats: dict = {"pages": [], "edge_functions": [], "api_routes": [], "spa_routes": [], "jobs": [], "components_count": 0,
                   "hooks": [], "middleware_matchers": [], "guards": []}
    no_jwt = set(stack.get("supabase_config", {}).get("functions_no_jwt", []))
    all_paths = sorted({rel(f, root) for f in files} | set(code))
    for r in all_paths:
        info = code.get(r) or {"routes": [], "server_routes": [], "hooks": [], "middleware_matcher": [], "guards": [], "cron": [], "tables": [], "env": [], "external_urls": [], "invokes": [], "doc": "", "errors": [], "side_effects": [], "webhook_events": []}
        feats["spa_routes"] += [{**x, "file": r} for x in info["routes"]]
        feats["api_routes"] += [{"method": x["method"], "path": x["path"], "file": r} for x in info["server_routes"]]
        feats["hooks"] += [{"name": h, "file": r} for h in info["hooks"]]
        feats["middleware_matchers"] += [{"pattern": m, "file": r} for m in info["middleware_matcher"]]
        feats["guards"] += [{"guard": g, "file": r} for g in info["guards"]]
        for c in info["cron"]:
            feats["jobs"].append({"kind": "cron (código)", "detail": c, "file": r})
        m = re.match(r"(?:src/)?app/(.*?)(?:/)?(page|route)\.(tsx|ts|jsx|js)$", r)
        if m:
            route = next_route(m.group(1))
            if m.group(2) == "page":
                feats["pages"].append({"path": route, "file": r, "component": "page"})
            else:
                feats["api_routes"].append({"method": "NEXT ROUTE", "path": route, "file": r})
        m = re.match(r"(?:src/)?routes/(.*?)/?\+page\.(svelte|ts|js)$", r)
        if m:
            feats["pages"].append({"path": next_route(m.group(1)), "file": r, "component": "page"})
        m = re.match(r"(?:src/)?routes/(.*?)/?\+server\.(ts|js)$", r)
        if m:
            feats["api_routes"].append({"method": "SVELTE SERVER", "path": "/" + m.group(1).strip("/"), "file": r})
        m = re.match(r"(?:src/)?pages/(?!api/)(.*?)\.(tsx|jsx|js|ts|vue|svelte)$", r)
        if m and (is_next or is_nuxt) and "_app" not in r and "_document" not in r:
            feats["pages"].append({"path": "/" + m.group(1).replace("index", "").strip("/"), "file": r, "component": "page"})
        m = re.match(r"(?:src/)?pages/api/(.*?)\.(ts|js)$", r)
        if m and is_next:
            feats["api_routes"].append({"method": "NEXT API", "path": "/api/" + m.group(1), "file": r})
        if re.search(r"/(pages|views|screens)/[^/]+\.(tsx|jsx|vue|svelte)$", "/" + r) and not any(x["file"] == r for x in feats["pages"]):
            feats["pages"].append({"path": "", "file": r, "component": Path(r).stem})
        if re.search(r"/components?/", "/" + r):
            feats["components_count"] += 1
        m = re.match(r"(?:.*/)?supabase/functions/([^/]+)/index\.(ts|js)$", r)
        if m and not m.group(1).startswith("_"):
            txt = read_text(root / r)
            shared = [code[d]["uses_service_role"] for d in transitive_deps(r, code, resolver, 3) if d in code]
            if any(shared):
                txt += "\nSERVICE_ROLE"  # herdado de _shared/
            methods = sorted(set(re.findall(r"""req(?:uest)?\.method\s*===?\s*['"](\w+)['"]""", txt)))
            name = m.group(1)
            if name in no_jwt:
                auth = "PÚBLICA (verify_jwt=false em config.toml)"
            elif "SERVICE_ROLE" in txt:
                auth = "service_role (ignora RLS)" + (" + valida JWT do usuário" if re.search(r"getUser\(|getClaims\(|Authorization", txt) else " — NÃO valida usuário no código")
            elif re.search(r"getUser\(|getClaims\(|Authorization", txt):
                auth = "JWT do usuário"
            else:
                auth = "n/d"
            feats["edge_functions"].append({
                "name": name, "file": r, "methods": methods or ["POST?"], "auth": auth,
                "tables": sorted({t["table"] for t in info["tables"]}), "env": info["env"], "external": info["external_urls"],
                "invokes": info["invokes"], "doc": info["doc"], "errors": info["errors"][:8], "side_effects": info["side_effects"],
                "webhook_events": info["webhook_events"],
                "idempotency": bool(re.search(r"idempot|dedup|already_processed|event_id|unique violation|23505", txt, re.I)),
            })
    uniq: dict[tuple, dict] = {}
    for x in feats["spa_routes"]:
        uniq.setdefault((x["path"], x["component"], x["file"]), x)
    feats["spa_routes"] = sorted(uniq.values(), key=lambda x: (x["path"], x["file"]))
    seen, pages = set(), []
    for p in feats["pages"]:
        if p["file"] not in seen:
            seen.add(p["file"]); pages.append(p)
    by_comp: dict[str, list] = {}
    for rt in feats["spa_routes"]:
        by_comp.setdefault(rt["component"].split(".")[0], []).append(rt["path"])
    for p in pages:
        if not p["path"] and p["component"] in by_comp:
            p["path"] = ", ".join(sorted(set(by_comp[p["component"]])))
    for p in pages:
        deps = transitive_deps(p["file"], code, resolver, 4)
        own = {t["table"] for t in code.get(p["file"], {}).get("tables", [])}
        p["tables_transitive"] = sorted({t["table"] for d in deps for t in code.get(d, {}).get("tables", [])} - own)
        p["invokes_transitive"] = sorted({i for d in deps for i in code.get(d, {}).get("invokes", [])} - set(code.get(p["file"], {}).get("invokes", [])))
        p["rpc_transitive"] = sorted({i for d in deps for i in code.get(d, {}).get("rpc", [])})
        p["deps_count"] = len(deps)
    feats["pages"] = sorted(pages, key=lambda x: (x["path"], x["file"]))
    for ef in feats["edge_functions"]:
        deps = transitive_deps(ef["file"], code, resolver, 3)
        ef["tables"] = sorted(set(ef["tables"]) | {t["table"] for d in deps for t in code.get(d, {}).get("tables", [])})
    for f in files:
        r = rel(f, root)
        if r.startswith(".github/workflows/"):
            for c in re.findall(r"cron:\s*['\"]([^'\"]+)['\"]", read_text(f)):
                feats["jobs"].append({"kind": "GitHub Actions cron", "detail": c, "file": r})
        if r == "vercel.json":
            try:
                for c in json.loads(read_text(f)).get("crons", []):
                    feats["jobs"].append({"kind": "Vercel cron", "detail": f"{c.get('schedule')} → {c.get('path')}", "file": r})
            except Exception:
                pass
    return feats


# --------------------------------------------------------------------------- #
# 6. Módulos
# --------------------------------------------------------------------------- #
def module_key(r: str) -> str:
    parts = r.split("/")
    if parts[0] in ("src", "app", "lib", "packages", "apps") and len(parts) > 2:
        key = "/".join(parts[:2]) if parts[0] not in ("packages", "apps") else "/".join(parts[:3])
        if parts[1] in ("features", "modules", "domains") and len(parts) > 3:
            key = "/".join(parts[:3])
        return key
    if parts[0] == "supabase":
        return "/".join(parts[:2]) if len(parts) > 2 else "supabase"
    return parts[0] if len(parts) > 1 else "(raiz)"


def detect_modules(root: Path, code: dict[str, dict]) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r, info in code.items():
        groups[module_key(r)].append(info)
    mods = []
    for key, infos in sorted(groups.items()):
        tables = sorted({t["table"] for i in infos for t in i["tables"]})
        exports = [f"{Path(i['path']).name}: {', '.join(e.split(' ', 1)[1] for e in i['exports'][:6])}" for i in infos if i["exports"]]
        docs = [f"{Path(i['path']).name}: {i['doc']}" for i in infos if i["doc"]][:6]
        ext_imports, internal = set(), set()
        for i in infos:
            for imp in i["imports"]:
                if imp.startswith((".", "/", "@/", "~", "src/")):
                    # resolve módulo interno
                    if imp.startswith(("@/", "~/")):
                        target = "src/" + imp[2:]
                    elif imp.startswith("."):
                        target = (Path(i["path"]).parent / imp).as_posix()
                        target = os.path.normpath(target).replace("\\", "/")
                    else:
                        target = imp.lstrip("/")
                    mk = module_key(target + "/x") if "/" in target else "(raiz)"
                    if mk != key:
                        internal.add(mk)
                else:
                    ext_imports.add(imp.split("/")[0] if not imp.startswith("@") else "/".join(imp.split("/")[:2]))
        mods.append({"module": key, "files": len(infos), "lines": sum(i["lines"] for i in infos), "tables": tables,
                     "exports": exports[:40], "docs": docs, "deps": sorted(ext_imports)[:25], "imports_modules": sorted(internal),
                     "file_list": [i["path"] for i in infos][:80]})
    return mods


# --------------------------------------------------------------------------- #
# 7. Fluxo de dados
# --------------------------------------------------------------------------- #
def build_dataflow(code: dict[str, dict], feats: dict, schema: dict) -> dict:
    table_usage: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))
    table_cols: dict[str, set] = defaultdict(set)
    env_usage, rpc_usage, invoke_usage, storage_usage, ext_usage, realtime = (defaultdict(set) for _ in range(6))
    dyn = []
    for r, info in code.items():
        for t in info["tables"]:
            for op in t["op"].split(","):
                table_usage[t["table"]][op].add(r)
        for t, cols in info["table_cols"].items():
            table_cols[t].update(cols)
        if info["dyn_from"]:
            dyn.append({"file": r, "count": info["dyn_from"]})
        for e in info["env"]: env_usage[e].add(r)
        for x in info["rpc"]: rpc_usage[x].add(r)
        for x in info["invokes"]: invoke_usage[x].add(r)
        for x in info["storage"]: storage_usage[x].add(r)
        for x in info["channels"]: realtime[x].add(r)
        for x in info["external_urls"]: ext_usage[re.sub(r"^(https?://[^/]+).*", r"\1", x)].add(r)
    cascades: dict[str, list[str]] = defaultdict(list)
    for t, tb in schema["tables"].items():
        for c in tb["columns"]:
            if c["fk"] and "cascade" in c["fk"].lower():
                cascades[c["fk"].split(".")[0]].append(t)
    def chain(t, seen):
        out = []
        for d in cascades.get(t, []):
            if d not in seen:
                seen.add(d); out.append(d); out += chain(d, seen)
        return out
    cascade_chains = {t: chain(t, set()) for t in cascades}
    tables_in_code = set(table_usage)
    schema_names = {k.split(".")[-1]: k for k in schema["tables"]}
    view_names = {k.split(".")[-1] for k in schema["views"]}
    cols_unknown = []
    for t, cols in table_cols.items():
        key = schema_names.get(t)
        if key:
            known = {c["name"] for c in schema["tables"][key]["columns"]}
            for c in sorted(cols):
                base = c.split(".")[0]
                if base not in known and not re.match(r"^[a-z_]+\(", c):
                    cols_unknown.append({"table": t, "column": c})
    return {
        "tables": {t: {op: sorted(fs) for op, fs in ops.items()} for t, ops in sorted(table_usage.items())},
        "table_cols": {t: sorted(c) for t, c in sorted(table_cols.items())},
        "env": {k: sorted(v) for k, v in sorted(env_usage.items())},
        "rpc": {k: sorted(v) for k, v in sorted(rpc_usage.items())},
        "invokes": {k: sorted(v) for k, v in sorted(invoke_usage.items())},
        "storage": {k: sorted(v) for k, v in sorted(storage_usage.items())},
        "realtime": {k: sorted(v) for k, v in sorted(realtime.items())},
        "external": {k: sorted(v) for k, v in sorted(ext_usage.items())},
        "dynamic_from": dyn,
        "cascade_chains": cascade_chains,
        "tables_only_in_code": sorted(tables_in_code - set(schema_names) - view_names) if schema["tables"] else [],
        "tables_only_in_schema": sorted(set(schema_names) - tables_in_code) if schema["tables"] else [],
        "columns_unknown": cols_unknown,
    }


# --------------------------------------------------------------------------- #
# 8. Regras de negócio + acesso + auditoria de consistência
# --------------------------------------------------------------------------- #
def collect_rules(code: dict[str, dict], schema: dict, feats: dict, dataflow: dict, stack: dict) -> dict:
    rules: dict = {"validation_schemas": [], "rhf": [], "html_constraints": [], "enums": [], "error_messages": [], "role_checks": [],
                   "comments": [], "db_constraints": [], "params": [], "transition_maps": [], "status_values": [],
                   "calc_fns": [], "temporal": [], "percents": [], "tests": [], "webhook_events": [], "side_effects": [],
                   "db_policies": schema["policies"], "db_triggers": schema["triggers"], "db_functions": schema["functions"],
                   "db_enums": schema["enums"], "db_raises": schema["raises"], "db_generated": [], "db_views": schema["views"],
                   "pagination": []}
    for r, info in code.items():
        if info["is_test"]:
            # teste: só os nomes contam (especificação); constantes/prazos/erros de fixture não são regra
            rules["tests"] += [{"file": r, "name": t} for t in info["tests"]]
            continue
        if not is_app_code(r):
            # fora do app (docs/, scripts/, qa/…): só erros contam; regras de UI/estado não
            rules["error_messages"] += [{"file": r, "msg": m} for m in info["errors"]]
            continue
        rules["validation_schemas"] += [{"file": r, **z} for z in info["zod"]]
        rules["rhf"] += [{"file": r, **x} for x in info["rhf"]]
        rules["html_constraints"] += [{"file": r, **x} for x in info["html_constraints"]]
        rules["enums"] += [{"file": r, **e} for e in info["enums"]]
        rules["error_messages"] += [{"file": r, "msg": m} for m in info["errors"]]
        rules["role_checks"] += [{"file": r, "value": v} for v in info["role_checks"]]
        rules["comments"] += [{"file": r, "text": c} for c in info["rule_comments"]]
        rules["params"] += [{"file": r, **x} for x in info["params"]]
        rules["transition_maps"] += [{"file": r, **x} for x in info["transition_maps"]]
        rules["status_values"] += [{"file": r, **x} for x in info["status_values"]]
        rules["calc_fns"] += [{"file": r, **x} for x in info["calc_fns"]]
        rules["temporal"] += [{"file": r, "line": x} for x in info["temporal"]]
        rules["percents"] += [{"file": r, "line": x} for x in info["percents"]]
        rules["webhook_events"] += [{"file": r, "event": e} for e in info["webhook_events"]]
        rules["side_effects"] += [{"file": r, "call": s} for s in info["side_effects"]]
        rules["pagination"] += [{"file": r, "limit": s} for s in info["pagination"]]
    for tname, t in schema["tables"].items():
        for c in t["columns"]:
            low = c["type"].lower()
            flags = []
            if "not null" in low and "default" not in low and "primary key" not in low: flags.append("obrigatório")
            if "unique" in low: flags.append("único")
            if "primary key" in low: flags.append("PK")
            dm = re.search(r"default\s+([^\s,]+(?:\([^)]*\))?)", c["type"], re.I)
            if dm: flags.append(f"default {dm.group(1)}")
            chk = SQL_CHECK_RE.search(c["type"])
            if chk: flags.append(f"CHECK {chk.group(1).strip()}")
            if c["fk"]: flags.append(f"FK → {c['fk']}")
            if c["generated"]:
                flags.append(f"CALCULADA = {c['generated']}")
                rules["db_generated"].append({"table": tname, "column": c["name"], "expr": c["generated"]})
            if flags:
                rules["db_constraints"].append({"table": tname, "column": c["name"], "rule": "; ".join(flags)})
        for cons in t["constraints"]:
            rules["db_constraints"].append({"table": tname, "column": "(tabela)", "rule": cons})
    # Máquinas de estado: colunas de status × valores (enum/CHECK) × usos no código
    status_cols = []
    for tname, t in schema["tables"].items():
        for c in t["columns"]:
            if STATUS_COL_RE.match(c["name"]):
                enum_name = next((e for e in schema["enums"] if re.search(rf"\b{re.escape(e)}\b", c["type"])), None)
                allowed = schema["enums"].get(enum_name, []) if enum_name else []
                chk = SQL_CHECK_RE.search(c["type"])
                chk_vals = re.findall(r"'([^']+)'", chk.group(1)) if chk else []
                for cons in t["constraints"]:
                    if re.search(rf"\b{re.escape(c['name'])}\b", cons) and "check" in cons.lower():
                        chk_vals += re.findall(r"'([^']+)'", cons)
                allowed = allowed or sorted(set(chk_vals))
                dm = re.search(r"default\s+'?([\w-]+)'?", c["type"], re.I)
                status_cols.append({"table": tname, "column": c["name"], "enum": enum_name or "", "allowed": allowed,
                                    "default": dm.group(1) if dm else "", "type": c["type"]})
    usage: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))
    for sv in rules["status_values"]:
        usage[sv["field"]][sv["value"]].add(f"{sv['kind']}:{sv['file']}")
    rules["state_machines"] = {"columns": status_cols, "usage": {f: {v: sorted(s) for v, s in vs.items()} for f, vs in usage.items()}}
    return rules


def build_access(code, schema, feats, dataflow, stack, rules) -> dict:
    roles = set()
    for e, vals in schema["enums"].items():
        if re.search(r"role|perfil|papel", e, re.I):
            roles.update(vals)
    for rc in rules["role_checks"]:
        if re.match(r"^[a-z_]+$", rc["value"]) and rc["value"] not in ("true", "false", "null", "undefined"):
            roles.add(rc["value"])
    for rt in feats["spa_routes"]:
        roles.update(rt.get("roles", []))
    pol_txt = " ".join(p["using"] + " " + p["check"] for p in schema["policies"]) + " ".join(f["body"] for f in schema["functions"].values())
    roles.update(re.findall(r"'(\w+)'::(?:public\.)?\w*(?:role|perfil)\w*", pol_txt))
    roles.update(re.findall(r"\bhas_role\([^)]*?'(\w+)'", pol_txt))
    roles.update(re.findall(r"\brole\s*=\s*'(\w+)'", pol_txt))
    role_tables = [k for k in schema["tables"] if re.search(r"role|perfil|permiss|member", k, re.I)]
    role_cols = [(k, c["name"], c["type"]) for k, t in schema["tables"].items() for c in t["columns"] if re.match(r"^(role|perfil|papel|user_type|tipo_usuario|is_admin|admin)$", c["name"], re.I)]
    jwt_claims = sorted(set(re.findall(r"auth\.jwt\(\)\s*->>?\s*'(\w+)'", json.dumps(schema["policies"]) + json.dumps(schema["functions"]))))
    policy_fns = sorted({fn for p in schema["policies"] for fn in re.findall(r"\b([a-z_]+)\s*\(", p["using"] + " " + p["check"]) if fn in schema["functions"]})
    # matriz tabela × comando → quem
    matrix = {}
    for key in sorted(schema["tables"]):
        pols = [p for p in schema["policies"] if p["table"] == key or p["table"] == key.split(".")[-1]]
        row = {"rls": schema["rls"].get(key, "não encontrado"), "SELECT": [], "INSERT": [], "UPDATE": [], "DELETE": []}
        for p in pols:
            cmds = ["SELECT", "INSERT", "UPDATE", "DELETE"] if p["cmd"] == "ALL" else [p["cmd"]]
            for c in cmds:
                row[c].append(f"{p['roles']}: {p['using'] or p['check'] or 'true'}"[:140])
        matrix[key] = row
    frontend_files = {r for r, i in code.items() if not r.startswith("supabase/functions/") and not i["uses_service_role"] and not i["is_test"]
                      and not re.search(r"(server|api|backend|scripts?)/", r)}
    risky = []
    for t, ops in dataflow["tables"].items():
        key = next((k for k in schema["tables"] if k.split(".")[-1] == t), None)
        if not key:
            continue
        fe = sorted({f for fs in ops.values() for f in fs if f in frontend_files})
        st = schema["rls"].get(key, "não encontrado")
        pols = [p for p in schema["policies"] if p["table"] in (key, t)]
        if fe and st in ("não encontrado", "disabled"):
            risky.append({"table": t, "issue": f"acessada do front ({len(fe)} arquivo(s)) sem RLS ({st})", "files": fe})
        if st in ("enabled", "forced") and not pols:
            risky.append({"table": t, "issue": "RLS ligado sem nenhuma política → só service_role acessa", "files": fe})
        elif st in ("enabled", "forced") and fe:
            covered = {c for p in pols for c in (["SELECT", "INSERT", "UPDATE", "DELETE"] if p["cmd"] == "ALL" else [p["cmd"]])}
            for op, cmd in (("select", "SELECT"), ("insert", "INSERT"), ("update", "UPDATE"), ("upsert", "INSERT"), ("delete", "DELETE")):
                fe_op = sorted(f for f in ops.get(op, []) if f in frontend_files)
                if fe_op and cmd not in covered:
                    risky.append({"table": t, "issue": f"front faz {cmd} mas nenhuma política RLS permite {cmd} → vai falhar/retornar vazio para usuários", "files": fe_op})
    tenant = defaultdict(list)
    for key, t in schema["tables"].items():
        for c in t["columns"]:
            if c["name"] in TENANT_COLS:
                tenant[c["name"]].append(key)
    tenant_key = max(tenant, key=lambda k: len(tenant[k])) if tenant else ""
    tenant_cov = len(tenant[tenant_key]) / max(1, len(schema["tables"])) if tenant_key else 0
    tenant_missing = [k for k in schema["tables"] if tenant_key and tenant_cov >= 0.6 and k not in tenant[tenant_key] and not re.search(r"role|profile|setting|config|log|audit|migration|tenant|empresa|organization|company|plan|catalog|lookup|enum", k, re.I)] if tenant_key else []
    soft = [(k, c["name"]) for k, t in schema["tables"].items() for c in t["columns"] if c["name"] in SOFT_DELETE_COLS]
    audit = {k: sorted(c["name"] for c in t["columns"] if c["name"] in AUDIT_COLS) for k, t in schema["tables"].items()}
    pii = [(k, c["name"]) for k, t in schema["tables"].items() for c in t["columns"] if PII_RE.search(c["name"]) and not c["name"].endswith("_id")]
    money_float = [(k, c["name"], c["type"]) for k, t in schema["tables"].items() for c in t["columns"]
                   if MONEY_RE.match(c["name"]) and re.search(r"\b(float|real|double|float4|float8)\b", c["type"], re.I)]
    money_cols = [(k, c["name"], c["type"].split(" ")[0]) for k, t in schema["tables"].items() for c in t["columns"] if MONEY_RE.match(c["name"]) and not c["name"].endswith("_id")]
    return {
        "roles": sorted(roles), "role_tables": role_tables, "role_cols": role_cols, "jwt_claims": jwt_claims, "policy_fns": policy_fns,
        "matrix": matrix, "risky": risky,
        "service_role_files": sorted(r for r, i in code.items() if i["uses_service_role"]),
        "security_definer_fns": sorted(n for n, f in schema["functions"].items() if f.get("security_definer")),
        "public_functions": stack.get("supabase_config", {}).get("functions_no_jwt", []),
        "auth_config": stack.get("supabase_config", {}).get("auth", {}),
        "grants": schema["grants"],
        "guards": feats["guards"], "protected_routes": [r for r in feats["spa_routes"] if r.get("guard")],
        "middleware_matchers": feats["middleware_matchers"],
        "tenant_key": tenant_key, "tenant_tables": tenant.get(tenant_key, []), "tenant_missing": tenant_missing, "tenant_cov": round(tenant_cov, 2),
        "soft_delete": soft, "audit": audit, "pii": pii, "money_float": money_float, "money_cols": money_cols,
    }


def build_audit(code, schema, feats, dataflow, rules, access, docs) -> dict:
    """Inconsistências e lacunas — o que o agente deve tratar como NÃO VERIFICADO."""
    issues, gaps = [], []
    all_enum_vals = {v for vals in schema["enums"].values() for v in vals} | {v for e in rules["enums"] for v in re.findall(r"['\"]([\w-]+)['\"]", e["values"]) + re.findall(r"\b([\w-]+)\b", e["values"]) if e["name"]}
    status_allowed = {v for c in rules["state_machines"]["columns"] for v in c["allowed"]}
    all_enum_vals |= status_allowed
    if schema["enums"] or status_allowed:
        for field, vals in rules["state_machines"]["usage"].items():
            if field not in ("tipo", "type", "role", "perfil"):
                for v, where in vals.items():
                    if v not in all_enum_vals and not re.match(r"^\d+$", v):
                        issues.append({"kind": "status", "msg": f"valor `{v}` para `{field}` usado no código não existe em nenhum enum do banco/TS", "where": where[:4]})
    for c in dataflow["columns_unknown"]:
        issues.append({"kind": "coluna", "msg": f"coluna `{c['column']}` usada no código não existe no schema de `{c['table']}`", "where": []})
    for t in dataflow["tables_only_in_code"]:
        issues.append({"kind": "tabela", "msg": f"tabela `{t}` usada no código não existe nas migrations/types do repo", "where": sorted({f for fs in dataflow["tables"][t].values() for f in fs})[:4]})
    for r in access["risky"]:
        issues.append({"kind": "rls", "msg": f"`{r['table']}`: {r['issue']}", "where": r["files"][:4]})
    for k, c, ty in access["money_float"]:
        issues.append({"kind": "dinheiro", "msg": f"`{k}.{c}` guarda dinheiro em `{ty}` (ponto flutuante) — arredondamento imprevisível; padrão é numeric", "where": []})
    for k in access["tenant_missing"]:
        issues.append({"kind": "tenant", "msg": f"`{k}` não tem coluna `{access['tenant_key']}` (isolamento por tenant pode estar incompleto)", "where": []})
    for k, v in dataflow["invokes"].items():
        if k not in {e["name"] for e in feats["edge_functions"]}:
            issues.append({"kind": "edge", "msg": f"edge function `{k}` invocada mas não existe em supabase/functions/", "where": v[:4]})
    for k, v in dataflow["rpc"].items():
        if k not in schema["functions"]:
            issues.append({"kind": "rpc", "msg": f"RPC `{k}` chamada mas não definida nas migrations/types", "where": v[:4]})
    for d in dataflow["dynamic_from"]:
        issues.append({"kind": "dinâmico", "msg": f"{d['count']} chamada(s) `.from(variável)` — tabela só conhecida em runtime", "where": [d["file"]]})
    for n, f in schema["functions"].items():
        if f.get("security_definer") and not f.get("search_path"):
            issues.append({"kind": "segurança", "msg": f"função `{n}` é SECURITY DEFINER sem `set search_path` (risco de escalação)", "where": [f["src"]]})
    for ef in feats["edge_functions"]:
        if ef["webhook_events"] and not ef["idempotency"]:
            issues.append({"kind": "webhook", "msg": f"edge function `{ef['name']}` processa eventos de webhook sem sinal de idempotência (evento duplicado = efeito duplicado)", "where": [ef["file"]]})
    # lacunas para humanos
    if not docs["manual"]:
        gaps.append("Nenhuma regra manual em `manual/`: prazos, limites, exceções comerciais, quem aprova o quê — só o negócio sabe.")
    for sc in rules["state_machines"]["columns"]:
        if not sc["allowed"]:
            gaps.append(f"`{sc['table']}.{sc['column']}` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.")
        elif not rules["transition_maps"]:
            gaps.append(f"`{sc['table']}.{sc['column']}` tem valores {sc['allowed']} mas nenhum mapa de transições foi encontrado no código — a ordem permitida (ex.: pago → cancelado?) não está declarada.")
    no_comment = [k for k, t in schema["tables"].items() if not t["comment"]]
    if no_comment and schema["tables"]:
        gaps.append(f"{len(no_comment)}/{len(schema['tables'])} tabelas sem `COMMENT ON TABLE` — o significado de negócio não está no schema: {', '.join(f'`{k}`' for k in no_comment[:12])}{' …' if len(no_comment) > 12 else ''}")
    if not rules["tests"]:
        gaps.append("Nenhum teste encontrado — não há especificação executável do comportamento esperado.")
    if not access["roles"]:
        gaps.append("Nenhum perfil/role identificado — quem pode fazer o quê não está explícito no código nem no banco.")
    if not schema["tables"]:
        gaps.append("Nenhum schema encontrado (migrations, prisma ou database.types.ts) — o banco real é desconhecido para este contexto.")
    if dataflow["tables_only_in_code"]:
        gaps.append("Há tabelas usadas no código sem migration no repo — o schema real pode ter sido alterado pelo painel.")
    return {"issues": issues, "gaps": gaps}


# --------------------------------------------------------------------------- #
# 9. Git
# --------------------------------------------------------------------------- #
def git_info(root: Path) -> dict:
    head = git(root, "rev-parse", "HEAD")
    branch = git(root, "rev-parse", "--abbrev-ref", "HEAD")
    remote = re.sub(r"https://[^@]+@", "https://", git(root, "config", "--get", "remote.origin.url"))
    raw = git(root, "log", "-n", "60", "--date=short", "--pretty=format:%H|%h|%ad|%an|%s", "--name-only")
    commits, cur, sha = [], None, head
    skip = False
    for line in raw.splitlines():
        parts = line.split("|")
        if len(parts) >= 5 and len(parts[0]) == 40 and not line.startswith(" "):
            subject = "|".join(parts[4:])
            skip = subject.startswith(BOT_COMMIT_PREFIX)   # commits do próprio bot não contam como mudança
            if skip:
                cur = None; continue
            if len(commits) == 0:
                sha = parts[0]
            cur = {"sha": parts[1], "date": parts[2], "author": parts[3], "subject": subject, "files": []}
            commits.append(cur)
        elif line.strip() and cur is not None and not skip:
            cur["files"].append(line.strip())
    commits = commits[:30]
    hot: dict[str, int] = defaultdict(int)
    for c in commits:
        for f in c["files"]:
            hot[f] += 1
    return {"sha": sha, "branch": branch, "remote": remote, "commits": commits, "hot_files": sorted(hot.items(), key=lambda x: -x[1])[:20]}


# --------------------------------------------------------------------------- #
# 10. Docs existentes
# --------------------------------------------------------------------------- #
def collect_existing_docs(root: Path, files: list[Path], out_dir: Path) -> dict:
    docs: dict = {"readme": "", "others": [], "manual": []}
    out_rel = rel(out_dir, root) if out_dir.is_relative_to(root) else "\0"
    for f in files:
        r = rel(f, root)
        if f.name.lower() == "readme.md" and r.count("/") == 0:
            docs["readme"] = trunc(read_text(f), 4000)
        elif f.suffix.lower() == ".md" and r.count("/") <= 2 and not r.startswith(out_rel):
            if f.name.upper() in ("CLAUDE.MD", "AGENTS.MD", "ARCHITECTURE.MD", "CONTRIBUTING.MD", "ADR.MD", "DECISIONS.MD") or r.startswith(("docs/", "adr/", "docs/adr/")):
                docs["others"].append({"file": r, "head": trunc(read_text(f), 600)})
    manual_dir = out_dir / "manual"
    if manual_dir.is_dir():
        for f in sorted(manual_dir.rglob("*.md")):
            if f.name.upper() == "README.MD" or f.name.upper().startswith("TEMPLATE"):
                continue
            docs["manual"].append({"file": f.relative_to(manual_dir).as_posix(), "content": read_text(f)})
    return docs


MANUAL_TEMPLATE = """# Regras de negócio — preencha o que o código não diz

> Copie este arquivo para `regras.md` (ou vários arquivos por área) e preencha. Tudo em `manual/` entra em
> `07-REGRAS-DE-NEGOCIO.md` seção A, com prioridade sobre o que foi extraído automaticamente.

## 1. O que o sistema faz e para quem (1 parágrafo)

## 2. Atores / perfis e o que cada um pode fazer
| Perfil | Pode | Não pode |
|---|---|---|

## 3. Entidades principais e o que significam (glossário do negócio)
| Termo | Significa | Tabela/arquivo |
|---|---|---|

## 4. Ciclo de vida / estados e transições permitidas
Ex.: pedido: novo → pago → enviado → entregue; cancelado só a partir de novo/pago; quem pode cancelar.

## 5. Regras de cálculo (fórmulas, arredondamento, moeda, impostos, comissões, descontos máximos)

## 6. Prazos, limites e quotas (ex.: expira em 7 dias, máximo 3 tentativas, limite por plano)

## 7. Integrações: o que entra, o que sai, o que acontece se falhar

## 8. Exceções comerciais e decisões já tomadas (o que NÃO mudar e por quê)

## 9. Dúvidas em aberto
"""


# --------------------------------------------------------------------------- #
# 11. LLM opcional
# --------------------------------------------------------------------------- #
def llm_synthesis(facts: dict, cache_dir: Path, model: str) -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        log("ANTHROPIC_API_KEY ausente — síntese narrativa desativada")
        return ""
    h = stable_hash(facts)
    cache = cache_dir / f"llm-{h}.md"
    if cache.exists():
        return cache.read_text(encoding="utf-8")
    prompt = ("Você é um arquiteto de software. Com base EXCLUSIVAMENTE nos fatos JSON abaixo, extraídos automaticamente de um "
              "repositório, escreva em PT-BR, em Markdown, sem inventar nada (sem evidência → 'não identificado'):\n"
              "## Função geral do sistema (3-6 frases)\n## Atores e perfis\n"
              "## Regras de negócio inferidas (cada item cita arquivo/tabela)\n## Fluxos principais passo a passo (tabela/função/rota)\n"
              "## Máquinas de estado e transições\n## Pontos de atenção para quem for alterar o sistema\n\n"
              f"FATOS:\n{json.dumps(facts, ensure_ascii=False, default=list)[:150000]}")
    body = json.dumps({"model": model, "max_tokens": 5000, "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, method="POST",
                                 headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read())
        text = "".join(b.get("text", "") for b in data.get("content", []))
        cache_dir.mkdir(parents=True, exist_ok=True)
        for old in cache_dir.glob("llm-*.md"):
            old.unlink()
        cache.write_text(text, encoding="utf-8")
        return text
    except Exception as e:  # noqa: BLE001
        log(f"falha na síntese LLM: {e}")
        return ""


# --------------------------------------------------------------------------- #
# 12. Renderização
# --------------------------------------------------------------------------- #
def header(title: str, meta: dict) -> str:
    return (f"# {title}\n\n> Gerado automaticamente por AI Context Sync v{VERSION} · commit `{meta['sha'][:10] or 'n/d'}` · "
            f"branch `{meta['branch'] or 'n/d'}` · {meta['generated_at']}\n> Não edite à mão — regras humanas vão em `manual/`.\n\n")


def render_index(meta, stack, feats, schema, mods, docs, dataflow, rules, access, audit) -> str:
    s = header("00 · ÍNDICE DO CONTEXTO PARA AGENTES DE IA", meta)
    s += "## Leia nesta ordem antes de qualquer tarefa ou planejamento\n\n"
    s += ("1. `01-VISAO-GERAL.md` — o que o sistema é, stack, deploy.\n"
          "2. `07-REGRAS-DE-NEGOCIO.md` — regras que NÃO podem ser quebradas (manuais, RLS, constraints, estados, validações, fórmulas, prazos).\n"
          "3. `10-ACESSO-E-SEGURANCA.md` — quem pode o quê; onde RLS é ignorado (service_role); funções públicas; multi-tenant; PII.\n"
          "4. `03-MODULOS.md` e `04-FUNCIONALIDADES.md` — onde cada coisa vive.\n"
          "5. `05-FLUXO-DE-DADOS.md` e `06-BANCO-DE-DADOS.md` — de onde vem / para onde vai cada dado.\n"
          "6. `08-INTEGRACOES.md` — serviços externos, env vars, feature flags.\n"
          "7. `11-GLOSSARIO-E-LACUNAS.md` — termos do domínio, dados de referência e **o que NÃO está verificado**.\n"
          "8. `09-MUDANCAS-RECENTES.md` — o que mudou por último (evite colidir).\n"
          "9. `context.json` — tudo em formato máquina.\n\n")
    s += "## Checklist pré-tarefa\n\n"
    s += ("- [ ] A tabela/rota/função que vou tocar aparece em `05`? Quem mais lê/escreve nela? Quais colunas o código usa?\n"
          "- [ ] Há regra em `07` (RLS, CHECK, enum, Zod, trigger, fórmula, prazo) que limita a mudança? Há regra manual em `manual/`?\n"
          "- [ ] A coluna de status tem transições declaradas (`07` seção E)? Estou criando um valor novo? Ele existe no enum do banco?\n"
          "- [ ] A tabela tem RLS e políticas (`10`)? Nova tabela precisa de RLS + política + coluna de tenant (se o sistema for multi-tenant).\n"
          "- [ ] Vou escrever dinheiro/percentual? Veja tipo da coluna e funções de cálculo (`07` seção G/H).\n"
          "- [ ] O efeito colateral (e-mail, webhook, cobrança) é idempotente? (`07` seção L/M)\n"
          "- [ ] Variáveis de ambiente necessárias existem (`08`)?\n"
          "- [ ] Há inconsistência listada em `11` tocando o que vou mudar? Trate como NÃO VERIFICADO.\n"
          "- [ ] Alguém alterou esses arquivos nos últimos commits (`09`)?\n\n")
    s += "## Números\n\n" + md_table(["Métrica", "Valor"], [
        ["Arquivos analisados", meta["files_total"]], ["Arquivos de código", meta["code_files"]], ["Linhas de código", meta["code_lines"]],
        ["Módulos", len(mods)], ["Páginas/telas", len(feats["pages"])], ["Rotas SPA", len(feats["spa_routes"])],
        ["Rotas de API / handlers", len(feats["api_routes"])], ["Edge functions", len(feats["edge_functions"])],
        ["Tabelas (schema)", len(schema["tables"])], ["Tabelas referenciadas no código", len(dataflow["tables"])],
        ["Políticas RLS", len(schema["policies"])], ["Triggers", len(schema["triggers"])], ["Funções SQL", len(schema["functions"])],
        ["Colunas de status (máquinas de estado)", len(rules["state_machines"]["columns"])], ["Schemas de validação", len(rules["validation_schemas"])],
        ["Funções de cálculo", len(rules["calc_fns"])], ["Testes (como especificação)", len(rules["tests"])],
        ["Perfis/roles identificados", len(access["roles"])], ["Inconsistências detectadas", len(audit["issues"])],
        ["Lacunas para humanos", len(audit["gaps"])], ["Regras manuais (manual/)", len(docs["manual"])],
    ])
    s += "\n## Stack resumida\n\n" + (", ".join(stack["frameworks"]) or "não identificada") + "\n"
    if audit["issues"]:
        s += f"\n> ⚠️ **{len(audit['issues'])} inconsistência(s)** entre código e schema — veja `11-GLOSSARIO-E-LACUNAS.md` antes de confiar no que está escrito.\n"
    return s


def render_overview(meta, stack, docs, feats, dataflow, llm_text) -> str:
    s = header("01 · VISÃO GERAL DO SISTEMA", meta)
    s += f"**Repositório:** `{meta['remote'] or 'n/d'}`  \n**Nome (package):** `{stack.get('name') or 'n/d'}`  \n**Descrição (package):** {stack.get('description') or 'n/d'}\n\n"
    s += "## Função geral\n\n"
    s += ("### Segundo o README\n\n" + redact(docs["readme"]) + "\n\n") if docs["readme"] else "_README não encontrado. Escreva `manual/regras.md` seção 1._\n\n"
    s += "### Evidências automáticas\n\n"
    s += f"- Frameworks: **{', '.join(stack['frameworks']) or 'n/d'}**\n- Gerenciador de pacotes: `{stack['package_manager'] or 'n/d'}`\n"
    s += f"- Linguagens (nº de arquivos): {', '.join(f'{k} ({v})' for k, v in list(stack['languages'].items())[:8]) or 'n/d'}\n"
    s += f"- Páginas/telas: {len(feats['pages'])} · Edge functions: {len(feats['edge_functions'])} · Tabelas usadas no código: {len(dataflow['tables'])}\n"
    if stack["monorepo_packages"]:
        s += "- Monorepo com pacotes: " + ", ".join(f"`{p['path']}`" for p in stack["monorepo_packages"][:15]) + "\n"
    s += "\n## Scripts (package.json)\n\n" + md_table(["Script", "Comando"], [[k, f"`{v}`"] for k, v in stack["scripts"].items()])
    s += "\n## Dependências relevantes\n\n" + md_table(["Pacote", "Versão", "Papel", "Onde"], [[k, v["version"], v["role"], v["in"]] for k, v in sorted(stack["deps"].items())])
    s += "\n## Infra / deploy\n\n" + md_table(["Arquivo", "Papel"], [[i["file"], i["role"]] for i in stack["infra"]])
    s += "\n## CI (GitHub Actions)\n\n" + md_table(["Workflow", "Nome", "Gatilhos"], [[c["file"], c["name"], ", ".join(c["triggers"])] for c in stack["ci"]])
    if docs["others"]:
        s += "\n## Outros documentos existentes no repositório\n\n" + "".join(f"### `{d['file']}`\n\n{redact(d['head'])}\n\n" for d in docs["others"])
    if llm_text:
        s += "\n## Síntese narrativa (LLM, a partir dos fatos — confira contra o código)\n\n" + llm_text + "\n"
    return s


def render_architecture(meta, root, files, stack, mods) -> str:
    s = header("02 · ARQUITETURA", meta)
    s += "## Árvore de diretórios (até 3 níveis)\n\n```\n" + dir_tree(root, files) + "\n```\n\n## Camadas identificadas\n\n"
    names = {m["module"] for m in mods}
    has = lambda *subs: any(any(sub in n for sub in subs) for n in names)
    layers = []
    if has("components"): layers.append("**UI** — `components/`")
    if has("pages", "views", "screens", "app/"): layers.append("**Telas/rotas** — `pages/`, `views/`, `app/`")
    if has("hooks"): layers.append("**Hooks** — `hooks/` (estado/fetch reutilizável)")
    if has("services", "api", "lib", "utils"): layers.append("**Serviços/lib** — `services/`, `lib/`, `api/`, `utils/`")
    if has("contexts", "store", "stores"): layers.append("**Estado global** — `contexts/`, `store/`")
    if has("types", "integrations"): layers.append("**Tipos/integrações** — `types/`, `integrations/`")
    if has("supabase/functions"): layers.append("**Backend serverless** — `supabase/functions/` (Deno)")
    if has("supabase/migrations"): layers.append("**Banco** — `supabase/migrations/` (fonte da verdade do schema)")
    if has("server", "backend"): layers.append("**Servidor** — `server/`, `backend/`")
    s += ("\n".join(f"- {l}" for l in layers) or "_não identificadas_") + "\n\n"
    s += "## Dependências entre módulos (quem importa quem)\n\n" + md_table(["Módulo", "Importa de"], [[f"`{m['module']}`", ", ".join(f"`{x}`" for x in m["imports_modules"])] for m in mods if m["imports_modules"]])
    s += "\n## Monorepo / pacotes\n\n" + md_table(["Caminho", "Nome"], [[p["path"], p["name"] or ""] for p in stack["monorepo_packages"]])
    s += "\n## Módulos (resumo — detalhes em 03-MODULOS.md)\n\n" + md_table(["Módulo", "Arquivos", "Linhas", "Tabelas que toca"],
        [[m["module"], m["files"], m["lines"], ", ".join(m["tables"][:8]) + (" …" if len(m["tables"]) > 8 else "")] for m in mods])
    return s


def render_modules(meta, mods) -> str:
    s = header("03 · MÓDULOS DO SISTEMA (detalhado)", meta)
    for m in mods:
        s += f"## `{m['module']}`\n\n- Arquivos: {m['files']} · Linhas: {m['lines']}\n"
        if m["tables"]: s += f"- Tabelas acessadas: {', '.join(f'`{t}`' for t in m['tables'])}\n"
        if m["imports_modules"]: s += f"- Depende dos módulos: {', '.join(f'`{t}`' for t in m['imports_modules'])}\n"
        if m["deps"]: s += f"- Dependências externas: {', '.join(f'`{d}`' for d in m['deps'])}\n"
        if m["docs"]: s += "- Descrições encontradas:\n" + "".join(f"  - {redact(d)}\n" for d in m["docs"])
        s += "\n<details><summary>Exports por arquivo</summary>\n\n" + "".join(f"- {e}\n" for e in m["exports"]) + "\n</details>\n\n"
        s += "<details><summary>Lista de arquivos</summary>\n\n" + "".join(f"- `{f}`\n" for f in m["file_list"]) + "\n</details>\n\n"
    return s


def render_features(meta, feats, code) -> str:
    s = header("04 · FUNCIONALIDADES DO SISTEMA (detalhado)", meta)
    s += "## Rotas de navegação (SPA / Router)\n\n" + md_table(["Rota", "Componente", "Proteção", "Definida em"],
        [[r["path"], r["component"], (r.get("guard") or "") + (f" {r['roles']}" if r.get("roles") else ""), f"`{r['file']}`"] for r in feats["spa_routes"]])
    s += "\n## Páginas / telas\n\n"
    rows = []
    for p in feats["pages"]:
        info = code.get(p["file"], {})
        rows.append([p["path"] or "(sem rota detectada)", f"`{p['file']}`", redact(info.get("doc", "")) or "",
                     ", ".join(sorted({t["table"] for t in info.get("tables", [])})),
                     ", ".join(p.get("tables_transitive", [])), ", ".join(info.get("invokes", []) + p.get("invokes_transitive", [])), ", ".join(info.get("side_effects", []))])
    s += md_table(["Rota", "Arquivo", "Descrição", "Tabelas (direto)", "Tabelas (via hooks/serviços)", "Edge functions", "Efeitos colaterais"], rows)
    s += "\n## Edge functions / serverless\n\n"
    for ef in feats["edge_functions"]:
        s += f"### `{ef['name']}`\n\n- Arquivo: `{ef['file']}`\n- Métodos: {', '.join(ef['methods'])} · Auth: **{ef['auth']}**\n"
        if ef["doc"]: s += f"- Descrição: {redact(ef['doc'])}\n"
        if ef["tables"]: s += f"- Tabelas: {', '.join(f'`{t}`' for t in ef['tables'])}\n"
        if ef["invokes"]: s += f"- Invoca: {', '.join(f'`{t}`' for t in ef['invokes'])}\n"
        if ef["external"]: s += f"- APIs externas: {', '.join(f'`{t}`' for t in ef['external'])}\n"
        if ef["side_effects"]: s += f"- Efeitos colaterais: {', '.join(f'`{t}`' for t in ef['side_effects'])}\n"
        if ef["webhook_events"]: s += f"- Eventos de webhook tratados: {', '.join(f'`{t}`' for t in ef['webhook_events'])} · idempotência: {'sinal encontrado' if ef['idempotency'] else '**não encontrada**'}\n"
        if ef["env"]: s += f"- Env: {', '.join(f'`{t}`' for t in ef['env'])}\n"
        if ef["errors"]: s += "- Erros/validações: " + " · ".join(f"“{redact(e)}”" for e in ef["errors"]) + "\n"
        s += "\n"
    if not feats["edge_functions"]: s += "_nenhuma_\n\n"
    s += "## Rotas de API / handlers de servidor\n\n" + md_table(["Método", "Rota", "Arquivo"], [[r["method"], r["path"], f"`{r['file']}`"] for r in sorted(feats["api_routes"], key=lambda x: (x["path"], x["method"]))])
    s += "\n## Hooks customizados\n\n" + md_table(["Hook", "Arquivo"], [[h["name"], f"`{h['file']}`"] for h in sorted(feats["hooks"], key=lambda x: x["name"])])
    s += "\n## Jobs agendados\n\n" + md_table(["Tipo", "Agendamento/detalhe", "Arquivo"], [[j["kind"], j["detail"], f"`{j['file']}`"] for j in feats["jobs"]])
    return s


def render_dataflow(meta, dataflow, schema, feats) -> str:
    s = header("05 · FLUXO DE DADOS — de onde vem e para onde vai cada informação", meta)
    s += "## Matriz tabela × arquivos (quem lê / quem escreve / quem apaga)\n\n"
    rows = []
    for t, ops in dataflow["tables"].items():
        key = next((k for k in schema["tables"] if k.split(".")[-1] == t), None)
        rls = schema["rls"].get(key, "não encontrado") if key else "—"
        reads = sorted(set(ops.get("select", []) + ops.get("ref", [])))
        writes = sorted(set(ops.get("insert", []) + ops.get("update", []) + ops.get("upsert", [])))
        rows.append([f"`{t}`", rls, files_cell(reads, 12), files_cell(writes, 12), files_cell(ops.get("delete", []), 12)])
    s += md_table(["Tabela", "RLS", "Lê", "Escreve", "Apaga"], rows)
    s += "\n## Colunas que o código usa por tabela (filtros/select)\n\n" + md_table(["Tabela", "Colunas"], [[f"`{t}`", ", ".join(f"`{c}`" for c in cols[:40])] for t, cols in dataflow["table_cols"].items()])
    if dataflow["tables_only_in_code"]:
        s += "\n> ⚠️ Tabelas usadas no código mas ausentes no schema do repo: " + ", ".join(f"`{t}`" for t in dataflow["tables_only_in_code"]) + " (podem existir só no banco).\n"
    if dataflow["tables_only_in_schema"]:
        s += "\n> ℹ️ Tabelas no schema sem referência direta no código: " + ", ".join(f"`{t}`" for t in dataflow["tables_only_in_schema"]) + " (via RPC/trigger/view ou obsoletas).\n"
    if dataflow["dynamic_from"]:
        s += "\n> ⚠️ NÃO VERIFICADO: `.from(variável)` em " + ", ".join(f"`{d['file']}` ({d['count']})" for d in dataflow["dynamic_from"]) + " — tabela só conhecida em runtime.\n"
    s += "\n## Funções RPC chamadas do cliente\n\n" + md_table(["RPC", "Chamada em", "Definida?"], [[f"`{k}`", files_cell(v), "✅" if k in schema["functions"] else "❌"] for k, v in dataflow["rpc"].items()])
    ef_names = {e["name"] for e in feats["edge_functions"]}
    s += "\n## Edge functions invocadas (cliente → função)\n\n" + md_table(["Função", "Invocada em", "Existe?"], [[f"`{k}`", files_cell(v), "✅" if k in ef_names else "❌"] for k, v in dataflow["invokes"].items()])
    s += "\n## Buckets de storage\n\n" + md_table(["Bucket", "Usado em"], [[f"`{k}`", files_cell(v)] for k, v in dataflow["storage"].items()])
    s += "\n## Canais realtime\n\n" + md_table(["Canal", "Usado em"], [[f"`{k}`", files_cell(v)] for k, v in dataflow["realtime"].items()])
    s += "\n## Chamadas a APIs externas\n\n" + md_table(["Host", "Chamado em"], [[f"`{k}`", files_cell(v)] for k, v in dataflow["external"].items()])
    s += "\n## Triggers (dados que mudam sozinhos no banco)\n\n" + md_table(["Trigger", "Quando", "Tabela", "Função", "Condição", "Migration"],
        [[t["name"], t["when"], f"`{t['table']}`", f"`{t['function']}`", f"`{t['condition']}`" if t["condition"] else "", f"`{t['src']}`"] for t in schema["triggers"]])
    s += "\n## Funções SQL → tabelas que tocam\n\n" + md_table(["Função", "Tabelas", "SECURITY DEFINER"], [[f"`{n}`", ", ".join(f"`{t}`" for t in f["tables"]), "sim" if f.get("security_definer") else ""] for n, f in sorted(schema["functions"].items()) if f["tables"]])
    s += "\n## Jobs no banco (pg_cron)\n\n" + md_table(["Job", "Agenda", "Comando", "Migration"], [[j["job"], j["schedule"], f"`{j['body']}`", f"`{j['src']}`"] for j in schema["cron_jobs"]])
    s += "\n## Cadeias de exclusão em cascata (apagar A apaga…)\n\n" + md_table(["Apagar", "Apaga em cascata"], [[f"`{t}`", ", ".join(f"`{x}`" for x in ch)] for t, ch in sorted(dataflow["cascade_chains"].items())])
    s += "\n## Relações (FK) entre tabelas\n\n"
    fk_rows = [[f"`{t}`.`{c['name']}`", f"`{c['fk']}`"] for t, tb in schema["tables"].items() for c in tb["columns"] if c["fk"]]
    s += md_table(["Coluna", "Referencia (ação ao apagar)"], fk_rows)
    if fk_rows:
        s += "\n```mermaid\nerDiagram\n"
        for t, tb in schema["tables"].items():
            for c in tb["columns"]:
                if c["fk"]:
                    s += f"  {re.sub(r'[^A-Za-z0-9_]', '_', c['fk'].split('.')[0])} ||--o{{ {re.sub(r'[^A-Za-z0-9_]', '_', t)} : {c['name']}\n"
        s += "```\n"
    return s


def render_database(meta, schema) -> str:
    s = header("06 · BANCO DE DADOS (schema reconstruído do repositório)", meta)
    s += f"Fontes: {', '.join(f'`{x}`' for x in schema['sources'][:30]) or '_nenhuma_'}" + (" …" if len(schema["sources"]) > 30 else "") + "\n\n"
    s += "> Resultado de aplicar as migrations na ordem dos nomes. Tabelas com origem `types.ts` vieram do arquivo de tipos gerado (sem constraints/RLS). Pode divergir do banco real se houve mudança manual no painel.\n\n## Tabelas\n\n"
    for t, tb in sorted(schema["tables"].items()):
        rls = schema["rls"].get(t, "não encontrado")
        s += f"### `{t}` — RLS: **{rls}** · origem: {tb['origin']}\n\n"
        if tb["comment"]: s += f"_{tb['comment']}_\n\n"
        s += md_table(["Coluna", "Tipo / restrições", "FK", "Comentário"], [[c["name"], f"`{c['type']}`", f"`{c['fk']}`" if c["fk"] else "", schema["comments"].get(f"column:{t}.{c['name']}", "")] for c in tb["columns"]])
        if tb["constraints"]: s += "\nConstraints: " + " · ".join(f"`{c}`" for c in tb["constraints"]) + "\n"
        pols = [p for p in schema["policies"] if p["table"] in (t, t.split(".")[-1])]
        if pols:
            s += "\nPolíticas RLS:\n\n" + md_table(["Política", "Comando", "Roles", "Modo", "USING", "WITH CHECK"], [[p["name"], p["cmd"], p["roles"], p["mode"], f"`{p['using']}`" if p["using"] else "", f"`{p['check']}`" if p["check"] else ""] for p in pols])
        idx = [i for i in schema["indexes"] if i["table"] in (t, t.split(".")[-1])]
        if idx: s += "\nÍndices: " + " · ".join(f"`{i['name']}` ({i['columns']}){' UNIQUE' if i['unique'] else ''}{' ' + i['where'] if i['where'] else ''}" for i in idx) + "\n"
        trg = [x for x in schema["triggers"] if x["table"] in (t, t.split(".")[-1])]
        if trg: s += "\nTriggers: " + " · ".join(f"`{x['name']}` {x['when']} → `{x['function']}`" for x in trg) + "\n"
        s += f"\nOrigem: `{tb['src']}`\n\n"
    s += "## Views\n\n"
    for v, body in schema["views"].items():
        s += f"### `{v}`\n\n```sql\n{body['body']}\n```\n\n"
    if not schema["views"]: s += "_nenhuma_\n\n"
    s += "## Enums\n\n" + md_table(["Enum", "Valores"], [[k, ", ".join(f"`{x}`" for x in v)] for k, v in schema["enums"].items()])
    s += "\n## Funções SQL\n\n"
    for name, fn in sorted(schema["functions"].items()):
        flags = (" · **SECURITY DEFINER**" if fn.get("security_definer") else "") + (" · search_path fixado" if fn.get("search_path") else "")
        s += f"### `{name}({fn['args']})` → `{fn['returns']}` [{fn['lang'] or '?'}]{flags}\n\n"
        if fn["body"]: s += f"```sql\n{fn['body']}\n```\n"
        if fn["raises"]: s += "Erros lançados: " + " · ".join(f"“{r}”" for r in fn["raises"]) + "\n"
        s += f"Origem: `{fn['src']}`\n\n"
    if not schema["functions"]: s += "_nenhuma_\n"
    s += "\n## Grants / Revokes\n\n" + md_table(["Ação", "Privilégios", "Objeto", "Para/De"], [[g["kind"], g["privs"], f"`{g['object']}` ({g['objkind']})", g["roles"]] for g in schema["grants"]])
    return s


def render_database_pointer(meta, schema, snap: str, snap_dir: Path, root: Path) -> str:
    s = header("06 · BANCO DE DADOS → fonte de verdade é o snapshot do banco real", meta)
    s += f"**Schema real (tabelas, colunas, RLS, funções, triggers, cron, storage, lints): `{snap}/`** — gerado a partir do banco de produção. "
    s += "Este arquivo NÃO reconstrói o schema; use o snapshot.\n\n"
    man = snap_dir / "manifest.json"
    if man.exists():
        try:
            m = json.loads(read_text(man))
            s += "Manifest do snapshot: " + ", ".join(f"{k}=`{v}`" for k, v in m.items() if isinstance(v, (str, int)) and k in ("gerado_em", "generated_at", "commit", "projeto", "project", "banco", "database", "versao", "version")) + "\n\n"
        except Exception:
            pass
    files = sorted(f.relative_to(snap_dir).as_posix() for f in snap_dir.rglob("*") if f.is_file() and f.suffix in (".md", ".json", ".sql") and f.stat().st_size > 0)
    s += "Arquivos do snapshot:\n\n" + ("".join(f"- `{snap}/{f}`\n" for f in files[:60]) or "_pasta vazia — snapshot ainda não rodou_\n")
    s += ("\n## O que as migrations do repositório dizem (pode divergir da produção)\n\n"
          f"Migrations/types encontrados: {len(schema['sources'])} arquivo(s); tabelas declaradas: {len(schema['tables'])}; políticas: {len(schema['policies'])}; funções: {len(schema['functions'])}. "
          "As regras extraídas delas estão em `07-REGRAS-DE-NEGOCIO.md` e `10-ACESSO-E-SEGURANCA.md`, marcadas como derivadas das migrations — "
          "quando o snapshot discordar, o snapshot vence.\n")
    return s


def render_rules(meta, rules, docs, schema) -> str:
    s = header("07 · REGRAS DE NEGÓCIO", meta)
    s += "## A. Regras escritas por humanos (`manual/` — prioridade máxima, nunca sobrescrito)\n\n"
    if docs["manual"]:
        for m in docs["manual"]:
            s += f"### {m['file']}\n\n{redact(m['content']).strip()}\n\n"
    else:
        s += "_Nenhum arquivo em `manual/`. Copie `manual/TEMPLATE-regras-de-negocio.md` para `manual/regras.md` e preencha._\n\n"
    s += "## B. Quem pode ver/alterar o quê (RLS — conforme migrations do repo; schema real em `06`)\n\n" + md_table(["Tabela", "Política", "Comando", "Roles", "Modo", "USING", "WITH CHECK"],
        [[f"`{p['table']}`", p["name"], p["cmd"], p["roles"], p["mode"], f"`{p['using']}`" if p["using"] else "", f"`{p['check']}`" if p["check"] else ""] for p in rules["db_policies"]])
    s += "\n## C. Restrições de dados (obrigatório / único / default / CHECK / FK / calculada)\n\n" + md_table(["Tabela", "Coluna", "Regra"], [[f"`{c['table']}`", f"`{c['column']}`", c["rule"]] for c in rules["db_constraints"]])
    s += "\n## D. Automações no banco (triggers e funções — regras que rodam sozinhas)\n\n" + md_table(["Trigger", "Quando", "Tabela", "Executa", "Condição"],
        [[t["name"], t["when"], f"`{t['table']}`", f"`{t['function']}`", f"`{t['condition']}`" if t["condition"] else ""] for t in rules["db_triggers"]])
    s += "\nErros lançados por funções SQL (`RAISE EXCEPTION` = regra de negócio no banco):\n\n" + md_table(["Função", "Mensagem", "Origem"], [[f"`{r['function']}`", r["msg"], f"`{r['src']}`"] for r in rules["db_raises"]])
    s += "\n## E. Estados, máquinas de estado e transições\n\n### E.1 Colunas de status no banco\n\n" + md_table(["Tabela", "Coluna", "Valores permitidos (enum/CHECK)", "Default"],
        [[f"`{c['table']}`", f"`{c['column']}`", ", ".join(f"`{v}`" for v in c["allowed"]) or "**livre (sem enum/CHECK)**", f"`{c['default']}`" if c["default"] else ""] for c in rules["state_machines"]["columns"]])
    s += "\n### E.2 Mapas de transição declarados no código\n\n"
    for tm in rules["transition_maps"]:
        s += f"- **{tm['name']}** (`{tm['file']}`):\n  ```ts\n  {redact(tm['body'])}\n  ```\n"
    if not rules["transition_maps"]: s += "_nenhum mapa explícito encontrado — transições só existem implicitamente nos `if`s (veja E.3)_\n"
    s += "\n### E.3 Valores de status usados no código (escreve / compara / filtra)\n\n"
    rows = []
    for f, vals in rules["state_machines"]["usage"].items():
        for v, where in sorted(vals.items()):
            kinds = sorted({w.split(":")[0] for w in where})
            rows.append([f"`{f}`", f"`{v}`", ", ".join(kinds), files_cell(sorted({w.split(':', 1)[1] for w in where}), 5)])
    s += md_table(["Campo", "Valor", "Uso", "Onde"], rows)
    s += "\n### E.4 Enums e listas de valores\n\n" + md_table(["Nome", "Valores", "Onde"], [[k, ", ".join(f"`{x}`" for x in v), "banco"] for k, v in rules["db_enums"].items()] + [[e["name"], e["values"], f"`{e['file']}`"] for e in rules["enums"]])
    s += "\n## F. Validações de entrada\n\n### F.1 Schemas Zod\n\n"
    for z in rules["validation_schemas"]:
        s += f"- **{z['name']}** (`{z['file']}`, z.{z['kind']}" + (f", encadeia {', '.join(z['chain'])}" if z["chain"] else "") + "):\n  ```ts\n  " + redact(z["body"]) + "\n  ```\n"
        if z["refines"]: s += "  - Regras cruzadas (refine): " + " · ".join(f"“{r}”" for r in z["refines"]) + "\n"
    if not rules["validation_schemas"]: s += "_nenhum_\n"
    s += "\n### F.2 react-hook-form (register/rules)\n\n" + md_table(["Campo", "Regras", "Arquivo"], [[f"`{x['field']}`", f"`{x['rules']}`", f"`{x['file']}`"] for x in rules["rhf"]])
    s += "\n### F.3 Restrições em inputs HTML (required/min/max/pattern)\n\n" + md_table(["Campo", "Restrições", "Arquivo"], [[f"`{x['field']}`", x["rules"], f"`{x['file']}`"] for x in rules["html_constraints"]])
    s += "\n## G. Fórmulas e derivações (como valores são calculados)\n\n### G.1 Colunas calculadas no banco\n\n" + md_table(["Tabela", "Coluna", "Expressão"], [[f"`{g['table']}`", f"`{g['column']}`", f"`{g['expr']}`"] for g in rules["db_generated"]])
    s += "\n### G.2 Views (consultas derivadas)\n\n" + md_table(["View", "SELECT"], [[f"`{v}`", f"`{trunc(b['body'], 300)}`"] for v, b in rules["db_views"].items()])
    s += "\n### G.3 Funções de cálculo/decisão no código\n\n"
    for c in rules["calc_fns"]:
        s += f"- **{c['name']}({c['params']})** — `{c['file']}`\n  ```\n  {redact(c['body'])}\n  ```\n"
    if not rules["calc_fns"]: s += "_nenhuma função com nome de cálculo/decisão encontrada_\n"
    s += "\n### G.4 Percentuais e multiplicadores no código\n\n" + md_table(["Trecho", "Arquivo"], [[f"`{x['line']}`", f"`{x['file']}`"] for x in rules["percents"]])
    s += "\n## H. Parâmetros de negócio (constantes, prazos, limites)\n\n### H.1 Constantes\n\n" + md_table(["Constante", "Valor", "Arquivo"], [[f"`{p['name']}`", f"`{p['value']}`", f"`{p['file']}`"] for p in rules["params"]])
    s += "\n### H.2 Prazos, expirações e janelas de tempo\n\n" + md_table(["Trecho", "Arquivo"], [[f"`{x['line']}`", f"`{x['file']}`"] for x in rules["temporal"]])
    s += "\n### H.3 Limites de paginação\n\n" + md_table(["Limite", "Arquivo"], [[x["limit"], f"`{x['file']}`"] for x in rules["pagination"]])
    s += "\n## I. Regras implícitas em mensagens de erro/validação\n\n" + md_table(["Mensagem", "Arquivo"], [[redact(e["msg"]), f"`{e['file']}`"] for e in rules["error_messages"]])
    s += "\n## J. Controle de acesso no código (checagens de perfil/permissão)\n\n" + md_table(["Valor comparado", "Arquivo"], [[f"`{r['value']}`", f"`{r['file']}`"] for r in rules["role_checks"]])
    by_file: dict[str, list[str]] = {}
    for t in rules["tests"]:
        by_file.setdefault(t["file"], []).append(t["name"])
    s += f"\n## K. Testes como especificação ({len(rules['tests'])} testes em {len(by_file)} arquivos — nomes completos em `context.json`)\n\n" + md_table(
        ["Arquivo", "Testes", "Exemplos do que o sistema DEVE fazer"],
        [[f"`{f}`", len(names), " · ".join(redact(n) for n in names[:4]) + (" …" if len(names) > 4 else "")] for f, names in sorted(by_file.items(), key=lambda x: -len(x[1]))])
    s += "\n## L. Eventos de webhook tratados (contratos com sistemas externos)\n\n" + md_table(["Evento", "Arquivo"], [[f"`{w['event']}`", f"`{w['file']}`"] for w in rules["webhook_events"]])
    s += "\n## M. Efeitos colaterais (e-mail, SMS, cobrança, fila — não são idempotentes por padrão)\n\n" + md_table(["Chamada", "Arquivo"], [[f"`{x['call']}`", f"`{x['file']}`"] for x in rules["side_effects"]])
    s += "\n## N. Regras citadas em comentários do código\n\n" + md_table(["Comentário", "Arquivo"], [[redact(c["text"]), f"`{c['file']}`"] for c in rules["comments"]])
    return s


def render_access(meta, access, schema) -> str:
    s = header("10 · ACESSO E SEGURANÇA — quem pode o quê", meta)
    s += "## Perfis / roles identificados\n\n" + (", ".join(f"`{r}`" for r in access["roles"]) or "_nenhum_") + "\n\n"
    s += "- Tabelas de perfil/permissão: " + (", ".join(f"`{t}`" for t in access["role_tables"]) or "nenhuma") + "\n"
    s += "- Colunas de perfil: " + (", ".join(f"`{t}.{c}` ({ty})" for t, c, ty in access["role_cols"]) or "nenhuma") + "\n"
    s += "- Claims do JWT usados em políticas/funções: " + (", ".join(f"`{c}`" for c in access["jwt_claims"]) or "nenhum") + "\n"
    s += "- Funções usadas dentro de políticas RLS (a regra real está no corpo delas — veja `06`): " + (", ".join(f"`{f}`" for f in access["policy_fns"]) or "nenhuma") + "\n\n"
    if access["auth_config"]:
        s += "## Configuração de auth (supabase/config.toml)\n\n" + md_table(["Chave", "Valor"], [[k, f"`{v}`"] for k, v in access["auth_config"].items()]) + "\n"
    s += "## Matriz tabela × operação → quem pode (derivada das políticas RLS)\n\n"
    rows = []
    for t, row in access["matrix"].items():
        cell = lambda xs: "<br>".join(xs) if xs else ("—" if row["rls"] in ("enabled", "forced") else "sem RLS")
        rows.append([f"`{t}`", row["rls"], cell(row["SELECT"]), cell(row["INSERT"]), cell(row["UPDATE"]), cell(row["DELETE"])])
    s += md_table(["Tabela", "RLS", "SELECT", "INSERT", "UPDATE", "DELETE"], rows)
    s += "\n> `—` com RLS ligado = ninguém além de service_role. `sem RLS` = qualquer chave anon lê/escreve tudo.\n"
    sr = access["service_role_files"]
    s += f"\n## Onde o RLS é IGNORADO (service_role) — {len(sr)} arquivo(s)\n\n" + ("".join(f"- `{f}`\n" for f in sr[:150]) + (f"- … +{len(sr) - 150} (lista completa em `context.json`)\n" if len(sr) > 150 else "") or "_nenhum arquivo usa service_role_\n")
    s += "\n## Funções SQL `SECURITY DEFINER` (rodam com privilégio do dono, ignoram RLS)\n\n" + ("".join(f"- `{f}`\n" for f in access["security_definer_fns"]) or "_nenhuma_\n")
    s += "\n## Edge functions públicas (sem JWT — qualquer um chama)\n\n" + ("".join(f"- `{f}`\n" for f in access["public_functions"]) or "_nenhuma declarada em config.toml_\n")
    s += "\n## Rotas protegidas no front\n\n" + md_table(["Rota", "Guard", "Roles", "Arquivo"], [[r["path"], r["guard"], ", ".join(r["roles"]), f"`{r['file']}`"] for r in access["protected_routes"]])
    s += "\nGuards usados: " + (", ".join(sorted({g["guard"] for g in access["guards"]})) or "nenhum") + "\n"
    s += "\nMiddleware matcher (Next.js): " + (", ".join(f"`{m['pattern']}`" for m in access["middleware_matchers"]) or "nenhum") + "\n"
    agg: dict[tuple, list] = {}
    for g in access["grants"]:
        agg.setdefault((g["kind"], g["roles"], g["privs"]), []).append(g["object"])
    s += "\n## Grants / Revokes (agrupados por role e privilégio)\n\n" + md_table(["Ação", "Para/De", "Privilégios", "Objetos"], [[k[0], k[1], k[2], ", ".join(f"`{o}`" for o in objs[:15]) + (f" … +{len(objs) - 15}" if len(objs) > 15 else "")] for k, objs in sorted(agg.items())])
    s += "\n## Riscos de acesso detectados\n\n" + md_table(["Tabela", "Problema", "Arquivos"], [[f"`{r['table']}`", r["issue"], files_cell(r["files"], 4)] for r in access["risky"]])
    s += "\n## Multi-tenancy\n\n"
    if access["tenant_key"]:
        s += f"- Chave de tenant: **`{access['tenant_key']}`** presente em {len(access['tenant_tables'])} tabela(s): {', '.join(f'`{t}`' for t in access['tenant_tables'])}\n"
        s += f"- Cobertura: {int(access['tenant_cov'] * 100)}% das tabelas. " + ("Tabelas SEM a chave (verificar isolamento): " + (", ".join(f"`{t}`" for t in access["tenant_missing"]) or "nenhuma") if access["tenant_cov"] >= 0.6 else "Abaixo de 60% — isolamento provavelmente por usuário (auth.uid()) ou misto; não flagado por tabela.") + "\n"
    else:
        s += "_nenhuma coluna de tenant identificada — sistema single-tenant ou isolamento por usuário (auth.uid())_\n"
    s += "\n## Soft delete (registros 'apagados' continuam na tabela — filtre!)\n\n" + md_table(["Tabela", "Coluna"], [[f"`{t}`", f"`{c}`"] for t, c in access["soft_delete"]])
    s += "\n## Auditoria (colunas de rastreio)\n\n" + md_table(["Tabela", "Colunas"], [[f"`{t}`", ", ".join(f"`{c}`" for c in cs)] for t, cs in access["audit"].items() if cs])
    s += "\n## Dados pessoais / sensíveis (LGPD — cuidado em logs, exports, prompts de IA)\n\n" + md_table(["Tabela", "Coluna"], [[f"`{t}`", f"`{c}`"] for t, c in access["pii"]])
    s += "\n## Colunas de dinheiro (tipo importa: numeric ✅ / float ❌)\n\n" + md_table(["Tabela", "Coluna", "Tipo"], [[f"`{t}`", f"`{c}`", f"`{ty}`"] for t, c, ty in access["money_cols"]])
    return s


def render_glossary(meta, schema, rules, access, audit, docs) -> str:
    s = header("11 · GLOSSÁRIO, DADOS DE REFERÊNCIA E LACUNAS", meta)
    s += "## Glossário do domínio (entidades do sistema)\n\n"
    rows = []
    for t, tb in sorted(schema["tables"].items()):
        rows.append([f"`{t}`", tb["comment"] or "_(sem COMMENT ON TABLE — significado não documentado)_", f"{len(tb['columns'])} colunas", tb["origin"]])
    for k, v in schema["enums"].items():
        rows.append([f"`{k}` (enum)", schema["comments"].get(f"type:{k}", ", ".join(v)), "", "banco"])
    for e in rules["enums"]:
        rows.append([f"`{e['name']}` (TS)", e["values"], "", f"`{e['file']}`"])
    s += md_table(["Termo", "Significado / valores", "Tamanho", "Origem"], rows)
    s += "\n## Dados de referência (seed — planos, categorias, perfis fixos)\n\n" + md_table(["Tabela", "Colunas", "Valores", "Origem"], [[f"`{x['table']}`", f"`{x['columns']}`", f"`{x['values']}`", f"`{x['src']}`"] for x in schema["seed"]])
    s += "\n## Auditoria de consistência (código × schema) — trate como NÃO VERIFICADO\n\n> `status`: inclui estados só de UI/realtime (ex.: `uploading`, `SUBSCRIBED`) que nunca vão ao banco — confira o arquivo antes de concluir que falta valor no enum.\n\n" + md_table(["Tipo", "Problema", "Onde"], [[i["kind"], i["msg"], files_cell(i["where"], 4)] for i in audit["issues"]])
    s += "\n## Lacunas — o que este contexto NÃO consegue responder (perguntas para o dono do negócio)\n\n" + ("".join(f"- {g}\n" for g in audit["gaps"]) or "_nenhuma lacuna detectada_\n")
    s += "\n## Regras manuais presentes\n\n" + ("".join(f"- `manual/{m['file']}`\n" for m in docs["manual"]) or "_nenhuma — copie `manual/TEMPLATE-regras-de-negocio.md`_\n")
    return s


def render_integrations(meta, stack, dataflow, root) -> str:
    s = header("08 · INTEGRAÇÕES, VARIÁVEIS DE AMBIENTE E FEATURE FLAGS", meta)
    example = {}
    for name in (".env.example", ".env.sample", ".env.template", ".env.local.example"):
        p = root / name
        if p.exists():
            for line in read_text(p).splitlines():
                m = re.match(r"\s*([A-Z][A-Z0-9_]+)\s*=", line)
                if m: example[m.group(1)] = name
    flags = {k: v for k, v in dataflow["env"].items() if re.match(r"^(FEATURE_|ENABLE_|FLAG_|USE_|DISABLE_|NEXT_PUBLIC_FEATURE_|VITE_FEATURE_|VITE_ENABLE_)", k)}
    s += "## Feature flags (comportamento muda por ambiente)\n\n" + md_table(["Flag", "Usada em"], [[f"`{k}`", files_cell(v)] for k, v in flags.items()])
    s += "\n## Variáveis de ambiente usadas no código\n\n" + md_table(["Variável", "No .env.example?", "Usada em"], [[f"`{k}`", "✅ " + example[k] if k in example else "❌", files_cell(v, 6)] for k, v in dataflow["env"].items()])
    s += "\n> Valores de segredos nunca entram aqui. Configure-os no serviço (Supabase secrets, Vercel env, GitHub secrets).\n"
    s += "\n## SDKs / serviços externos (por dependência)\n\n" + md_table(["Pacote", "Serviço", "Onde"], [[k, v["role"], v["in"]] for k, v in sorted(stack["deps"].items()) if any(w in v["role"] for w in SIDE_EFFECT_DEPS)])
    s += "\n## Hosts externos chamados diretamente\n\n" + md_table(["Host", "Chamado em"], [[f"`{k}`", files_cell(v, 6)] for k, v in dataflow["external"].items()])
    return s


def render_changes(meta, gitd) -> str:
    s = header("09 · MUDANÇAS RECENTES (últimos 30 commits)", meta)
    s += "## Arquivos mais alterados (maior risco de conflito)\n\n" + md_table(["Arquivo", "Commits"], [[f"`{f}`", n] for f, n in gitd["hot_files"]]) + "\n## Commits\n\n"
    for c in gitd["commits"]:
        s += f"- `{c['sha']}` {c['date']} — {redact(c['subject'])} _({c['author']})_\n"
        if c["files"]:
            s += "  - " + ", ".join(f"`{f}`" for f in c["files"][:10]) + (f" … +{len(c['files']) - 10}" if len(c["files"]) > 10 else "") + "\n"
    if not gitd["commits"]: s += "_histórico git indisponível (checkout raso?)_\n"
    return s


# --------------------------------------------------------------------------- #
# 13. Ponteiro em CLAUDE.md / AGENTS.md
# --------------------------------------------------------------------------- #
POINTER_START = "<!-- ai-context-sync:start -->"
POINTER_END = "<!-- ai-context-sync:end -->"


def upsert_pointer(root: Path, out_rel: str, index_rel: str, create_if_missing: bool) -> list[str]:
    block = (f"{POINTER_START}\n## Contexto para agentes de IA — protocolo\n\n"
             f"Antes de qualquer tarefa ou planejamento, leia `{index_rel}`: ele diz onde está cada fonte de verdade "
             f"(banco real, código, regras de negócio) e a ordem de leitura. Arquivos gerados têm o cabeçalho "
             f"\"Gerado automaticamente\" e não são editados à mão; regras humanas vivem em `{out_rel}/manual/`.\n{POINTER_END}")
    touched = []
    none_exist = not (root / "CLAUDE.md").exists() and not (root / "AGENTS.md").exists()
    for name in ("CLAUDE.md", "AGENTS.md"):
        p = root / name
        if p.exists():
            txt = read_text(p)
            new = re.sub(re.escape(POINTER_START) + r"[\s\S]*?" + re.escape(POINTER_END), block, txt) if POINTER_START in txt and POINTER_END in txt else txt.rstrip() + "\n\n" + block + "\n"
            if new != txt:
                p.write_text(new, encoding="utf-8"); touched.append(name)
        elif create_if_missing and none_exist:
            p.write_text(f"# {name}\n\n{block}\n", encoding="utf-8"); touched.append(name)
    return touched


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default=".")
    ap.add_argument("--out", default="docs/ai-context")
    ap.add_argument("--llm", action="store_true", help="síntese narrativa via API Anthropic (requer ANTHROPIC_API_KEY)")
    ap.add_argument("--model", default=os.environ.get("AI_CONTEXT_MODEL", "claude-sonnet-4-5"))
    ap.add_argument("--no-pointer", action="store_true")
    ap.add_argument("--check", action="store_true", help="exit 1 se os docs estão desatualizados")
    ap.add_argument("--force", action="store_true", help="regenera mesmo sem mudança")
    ap.add_argument("--profile", choices=["full", "codigo", "regras"], default=os.environ.get("AI_CONTEXT_PROFILE", "full"),
                    help="full = tudo; codigo = 01-05/08/09; regras = 07/10/11 + manual (quando outro script já cobre o código)")
    ap.add_argument("--schema-snapshot", default=os.environ.get("AI_CONTEXT_SCHEMA_SNAPSHOT", ""),
                    help="pasta (relativa ao repo) com o snapshot do banco real; 06 vira ponteiro para ela. Auto: docs/supabase se existir")
    ap.add_argument("--index-path", default=os.environ.get("AI_CONTEXT_INDEX", ""),
                    help="caminho do índice único que o ponteiro em CLAUDE.md/AGENTS.md deve apontar (default: <out>/00-INDEX.md)")
    args = ap.parse_args()

    root = Path(args.repo).resolve()
    out_dir = (root / args.out).resolve()
    out_rel = rel(out_dir, root) if out_dir.is_relative_to(root) else args.out.rstrip("/")
    log(f"repo={root} out={out_dir}")

    files = walk_repo(root, out_dir)
    code: dict[str, dict] = {}
    for f in files:
        info = analyze_code_file(f, root)
        if info:
            code[info["path"]] = info
    stack = detect_stack(root, files)
    schema = parse_sql_schema(root, files)
    feats = detect_features(root, files, code, stack)
    mods = detect_modules(root, code)
    dataflow = build_dataflow(code, feats, schema)
    rules = collect_rules(code, schema, feats, dataflow, stack)
    access = build_access(code, schema, feats, dataflow, stack, rules)
    for f in files:
        r = rel(f, root)
        if f.suffix == ".json" and re.search(r"(^|/)(locales?|i18n|lang|translations?)/", r) and f.stat().st_size < 300_000:
            try:
                data = json.loads(read_text(f))
            except Exception:
                continue
            def walk(obj, prefix=""):
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        yield from walk(v, f"{prefix}{k}.")
                elif isinstance(obj, str) and re.search(r"(error|erro|invalid|inv[aá]lid|required|obrigat|limit|m[aá]x|m[ií]n|not allowed|n[aã]o pode|n[aã]o permit)", prefix + obj, re.I):
                    yield prefix.rstrip("."), obj
            for k, v in list(walk(data))[:80]:
                rules["error_messages"].append({"file": f"{r}#{k}", "msg": trunc(v, 160)})
    gitd = git_info(root)
    docs = collect_existing_docs(root, files, out_dir)
    audit = build_audit(code, schema, feats, dataflow, rules, access, docs)

    facts = {"stack": stack, "schema": schema, "features": feats, "modules": mods, "dataflow": dataflow, "rules": rules,
             "access": access, "audit": audit, "manual": docs["manual"], "readme": docs["readme"]}
    facts_hash = stable_hash(facts)
    state_path = out_dir / ".state.json"
    prev = {}
    if state_path.exists():
        try: prev = json.loads(state_path.read_text())
        except Exception: prev = {}
    changed = prev.get("facts_hash") != facts_hash or prev.get("version") != VERSION
    log(f"facts_hash={facts_hash} prev={prev.get('facts_hash')} changed={changed}")
    if args.check:
        return 1 if changed else 0
    if not changed and prev.get("sha") == gitd["sha"] and not args.force:
        log("nada mudou — nenhuma escrita")
        return 0

    meta = {"sha": gitd["sha"], "branch": gitd["branch"], "remote": gitd["remote"],
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "files_total": len(files), "code_files": len(code), "code_lines": sum(i["lines"] for i in code.values())}
    llm_text = llm_synthesis({k: facts[k] for k in ("stack", "schema", "features", "dataflow", "rules", "access", "audit", "readme")}, out_dir / ".cache", args.model) if args.llm else ""

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "manual").mkdir(exist_ok=True)
    tpl = out_dir / "manual" / "TEMPLATE-regras-de-negocio.md"
    if not tpl.exists():
        tpl.write_text(MANUAL_TEMPLATE, encoding="utf-8")
    rd = out_dir / "manual" / "README.md"
    if not rd.exists():
        rd.write_text("# Regras manuais\n\nArquivos `.md` aqui (exceto README e TEMPLATE*) entram em `07-REGRAS-DE-NEGOCIO.md` seção A com prioridade máxima e nunca são sobrescritos. Comece copiando `TEMPLATE-regras-de-negocio.md` para `regras.md`.\n", encoding="utf-8")

    snap = args.schema_snapshot or ("docs/supabase" if (root / "docs" / "supabase").is_dir() else "")
    snap_dir = (root / snap) if snap else None
    if snap_dir and not snap_dir.is_dir():
        log(f"aviso: snapshot {snap} não existe — 06 reconstruído das migrations")
        snap_dir = None
    outputs = {
        "00-INDEX.md": render_index(meta, stack, feats, schema, mods, docs, dataflow, rules, access, audit),
        "01-VISAO-GERAL.md": render_overview(meta, stack, docs, feats, dataflow, llm_text),
        "02-ARQUITETURA.md": render_architecture(meta, root, files, stack, mods),
        "03-MODULOS.md": render_modules(meta, mods),
        "04-FUNCIONALIDADES.md": render_features(meta, feats, code),
        "05-FLUXO-DE-DADOS.md": render_dataflow(meta, dataflow, schema, feats),
        "06-BANCO-DE-DADOS.md": render_database_pointer(meta, schema, snap, snap_dir, root) if snap_dir else render_database(meta, schema),
        "07-REGRAS-DE-NEGOCIO.md": render_rules(meta, rules, docs, schema),
        "08-INTEGRACOES.md": render_integrations(meta, stack, dataflow, root),
        "09-MUDANCAS-RECENTES.md": render_changes(meta, gitd),
        "10-ACESSO-E-SEGURANCA.md": render_access(meta, access, schema),
        "11-GLOSSARIO-E-LACUNAS.md": render_glossary(meta, schema, rules, access, audit, docs),
    }
    PROFILES = {"codigo": {"00-INDEX.md", "01-VISAO-GERAL.md", "02-ARQUITETURA.md", "03-MODULOS.md", "04-FUNCIONALIDADES.md", "05-FLUXO-DE-DADOS.md", "06-BANCO-DE-DADOS.md", "08-INTEGRACOES.md", "09-MUDANCAS-RECENTES.md"},
                "regras": {"07-REGRAS-DE-NEGOCIO.md", "10-ACESSO-E-SEGURANCA.md", "11-GLOSSARIO-E-LACUNAS.md"}}
    if args.profile in PROFILES:
        outputs = {k: v for k, v in outputs.items() if k in PROFILES[args.profile]}
        for stale in set(PROFILES["codigo"] | PROFILES["regras"]) - set(outputs):
            if (out_dir / stale).exists():
                (out_dir / stale).unlink()
    written = []
    for name, content in outputs.items():
        p = out_dir / name
        content = redact(content)
        if not p.exists() or p.read_text(encoding="utf-8") != content:
            p.write_text(content, encoding="utf-8"); written.append(name)
    ctx = {"meta": meta, "version": VERSION, "facts_hash": facts_hash, **facts,
           "code_files": {k: {kk: vv for kk, vv in v.items() if kk != "imports" and vv not in ([], {}, "", 0, False)} for k, v in code.items()}, "git": gitd}
    (out_dir / "context.json").write_text(json.dumps(ctx, ensure_ascii=False, indent=1, default=list), encoding="utf-8")
    state_path.write_text(json.dumps({"facts_hash": facts_hash, "sha": gitd["sha"], "version": VERSION, "generated_at": meta["generated_at"]}, indent=1), encoding="utf-8")
    manifest = {"produtor": "ai-context-sync", "versao": VERSION, "perfil": args.profile, "gerado_em": meta["generated_at"], "commit": gitd["sha"],
                "fonte": {"full": "código do repo + migrations/types + manual/", "codigo": "código do repo", "regras": "código + migrations/types + manual/ (regras de negócio)"}[args.profile],
                "entrada": sorted(outputs)[0] if outputs else "", "arquivos": sorted(outputs) + ["context.json"],
                "schema_real_em": snap if snap_dir else "", "inconsistencias": len(audit["issues"]), "lacunas": len(audit["gaps"])}
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    if not args.no_pointer:
        index_rel = args.index_path.strip("/") or f"{out_rel}/00-INDEX.md"
        written += upsert_pointer(root, out_rel, index_rel, create_if_missing=True)
    log(f"escritos: {', '.join(written) or 'nenhum (sem diferença)'} + context.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
