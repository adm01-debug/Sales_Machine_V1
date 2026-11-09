#!/usr/bin/env python3
"""
Índice único do contexto para agentes de IA — junta várias fontes de verdade em um 00-INDEX.md.

Cada fonte é um produtor independente (script, secret e falha próprios). Este script só lê o que
eles publicaram (manifest.json + arquivos) e escreve UM índice dizendo "tabelas → aqui, módulos →
ali, regras → acolá", com a idade de cada fonte. Se uma fonte não rodou, o índice diz isso em vez
de quebrar.

Uso:
  python3 scripts/ai_context/indice.py --out docs/contexto/00-INDEX.md \
      --fonte "banco real=docs/supabase@supabase-snapshot" \
      --fonte "código=inventario/ia@contexto-ia" \
      --fonte "regras de negócio=docs/contexto/regras"

  --fonte "NOME=CAMINHO[@BRANCH]"   CAMINHO relativo ao repo; @BRANCH quando a saída vive em branch derivada.
                                    Se o caminho existir no checkout atual, lista arquivos e lê manifest.json;
                                    se não, escreve como ler (git show / raw URL) sem inventar conteúdo.
  --repo .                          raiz do repositório
  --remote owner/repo               para montar URLs raw (default: lido de git remote)
  --stale-min 90                    idade (min) a partir da qual uma fonte é marcada como desatualizada
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROTEIRO = {
    "banco real": ("Tabelas, colunas, RLS/políticas, funções, triggers, cron, storage, lints — **como está em produção agora**",
                   "Vou tocar tabela/coluna/política/função SQL · Quero saber se algo existe de verdade no banco"),
    "código": ("Rotas, telas, módulos, hooks, edge functions, grafo de dependências, testes, scripts, convenções",
               "Vou mexer em tela/rota/hook/edge · Preciso saber onde uma coisa vive e quem a usa"),
    "regras de negócio": ("Regras que não podem ser quebradas: RLS por operação, estados e transições, validações, fórmulas, prazos, "
                          "erros de negócio, testes como especificação, inconsistências código×schema (NÃO VERIFICADO) e regras humanas (`manual/`)",
                          "Qualquer mudança de comportamento · Antes de criar status/valor/validação · Antes de planejar"),
}
ORDEM = ["regras de negócio", "banco real", "código"]


def git(root: Path, *a: str) -> str:
    try:
        return subprocess.run(["git", *a], cwd=root, capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception:
        return ""


def parse_dt(v) -> datetime | None:
    if not isinstance(v, str):
        return None
    for fmt in ("%Y-%m-%d %H:%M UTC", "%Y-%m-%d %H:%M:%S UTC", "%Y-%m-%dT%H:%M UTC", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            d = datetime.strptime(v, fmt)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def read_manifest(d: Path) -> dict:
    for name in ("manifest.json", "MANIFEST.json", ".state.json"):
        p = d / name
        if p.exists():
            try:
                manifest = json.loads(p.read_text(encoding="utf-8"))
                if not isinstance(manifest, dict):
                    return {"_erro": f"{name} não contém um objeto JSON"}
                return manifest
            except Exception:
                return {"_erro": f"{name} ilegível"}
    return {}


def producer_health(d: Path, man: dict) -> tuple[str, list[str]]:
    """Resume falhas de coleta; achados de negócio não são erros do produtor."""
    if man.get("_erro"):
        return "não verificável", [man["_erro"]]
    avisos = []
    for key in ("erros", "errors", "erros_do_gerador"):
        errors = man.get(key)
        if errors:
            total = len(errors) if isinstance(errors, (list, dict)) else 1
            avisos.append(f"{total} erro(s) de coleta no manifest ({key})")
    if man.get("carried"):
        avisos.append("seções reaproveitadas da coleta anterior")
    report = d / "errors.md"
    if report.exists():
        try:
            # O snapshot publica uma tabela com um registro por seção que falhou.
            rows = [line for line in report.read_text(encoding="utf-8").splitlines()
                    if re.match(r"^\s*\|", line)]
            errors = [line for line in rows[2:] if line.strip().strip("|").strip()]
            if errors:
                avisos.append(f"{len(errors)} seção(ões) com erro em errors.md")
        except (OSError, UnicodeError):
            return "não verificável", avisos + ["errors.md ilegível"]
    return ("parcial" if avisos else "ok"), avisos


def entry_file(d: Path, man: dict) -> str:
    cand = man.get("entrada") or man.get("entry") or ""
    if cand and (d / cand).exists():
        return cand
    for name in ("00-INDEX.md", "INDEX.md", "README.md", "index.md"):
        if (d / name).exists():
            return name
    mds = sorted(p.name for p in d.glob("*.md"))
    return mds[0] if mds else ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default=".")
    ap.add_argument("--out", default="docs/contexto/00-INDEX.md")
    ap.add_argument("--fonte", action="append", default=[], help='"NOME=CAMINHO[@BRANCH]" (repetível)')
    ap.add_argument("--remote", default="")
    ap.add_argument("--stale-min", type=int, default=90)
    ap.add_argument("--titulo", default="CONTEXTO PARA AGENTES DE IA — ÍNDICE ÚNICO")
    ap.add_argument("--head", default="", help="sha do commit de código de referência (default: HEAD do --repo); use quando o índice é montado numa branch gerada")
    args = ap.parse_args()
    root = Path(args.repo).resolve()
    out = (root / args.out).resolve()
    remote = args.remote or re.sub(r"^.*github\.com[:/]|\.git$", "", git(root, "config", "--get", "remote.origin.url"))
    now = datetime.now(timezone.utc)
    head = args.head or git(root, "rev-parse", "HEAD")

    fontes = []
    for spec in args.fonte:
        if "=" not in spec:
            print(f"[indice] fonte inválida: {spec}", file=sys.stderr); return 2
        nome, resto = spec.split("=", 1)
        caminho, _, branch = resto.partition("@")
        nome, caminho, branch = nome.strip(), caminho.strip().strip("/"), branch.strip()
        d = root / caminho
        local = d.is_dir() and any(d.iterdir())
        man = read_manifest(d) if local else {}
        gerado = parse_dt(man.get("gerado_em") or man.get("generated_at") or man.get("timestamp") or man.get("data"))
        if local and not gerado:
            # produtor sem manifest datado: 1º "## <data>" do CHANGELOG.md, senão o último commit da pasta
            cl = d / "CHANGELOG.md"
            if cl.exists():
                m = re.search(r"^## (\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?: UTC|Z)?)", cl.read_text(encoding="utf-8", errors="replace"), re.M)
                if m:
                    gerado = parse_dt(m.group(1).replace("Z", " UTC") if m.group(1).endswith("Z") else m.group(1))
            if not gerado:
                gerado = parse_dt(git(root, "log", "-1", "--format=%cI", "--", caminho))
        idade_min = int((now - gerado).total_seconds() // 60) if gerado else None
        commit = man.get("commit") or man.get("sha") or ""
        status, avisos = producer_health(d, man) if local else ("ok", [])
        if not local:
            status = "não disponível neste checkout" if branch else "ainda não gerado"
        mesmo_commit = (isinstance(commit, str) and isinstance(head, str)
                        and min(len(commit), len(head)) >= 7
                        and (head.startswith(commit) or commit.startswith(head)))
        # Código/regras dependem do commit: o gate pode reutilizar a mesma revisão
        # por dias. O banco muda sem push e continua sujeito à idade da coleta.
        atual_por_commit = nome in ("código", "regras de negócio") and mesmo_commit
        if idade_min is not None and idade_min > args.stale_min and not atual_por_commit:
            avisos.append(f"desatualizado há {idade_min // 60}h{idade_min % 60:02d}")
            if status == "ok":
                status = "desatualizado"
        if commit and head and not mesmo_commit and nome != "banco real":
            avisos.append(f"gerado no commit `{str(commit)[:7]}`, HEAD é `{head[:7]}`")
            if status == "ok":
                status = "desatualizado"
        arquivos = sorted(p.relative_to(d).as_posix() for p in d.rglob("*") if p.is_file() and p.suffix in (".md", ".json") and not p.name.startswith(".")) if local else []
        fontes.append({"nome": nome, "caminho": caminho, "branch": branch, "local": local, "manifest": man, "gerado": gerado, "idade_min": idade_min,
                       "commit": commit, "status": status, "avisos": avisos, "arquivos": arquivos, "entrada": entry_file(d, man) if local else ""})

    def como_ler(f):
        if f["local"]:
            return f"`{f['caminho']}/{f['entrada'] or ''}`".rstrip("/`") + "`" if f["entrada"] else f"`{f['caminho']}/`"
        if f["branch"]:
            raw = f"https://raw.githubusercontent.com/{remote}/{f['branch']}/{f['caminho']}/" if remote else ""
            return (f"branch `{f['branch']}`: `git fetch origin {f['branch']} && git show origin/{f['branch']}:{f['caminho']}/<arquivo>`"
                    + (f" · MCP `get_file(ref={f['branch']})` · raw `{raw}<arquivo>`" if raw else ""))
        return f"`{f['caminho']}/` (ainda não existe — o produtor não rodou)"

    L = []
    L.append(f"# {args.titulo}\n")
    L.append(f"> Gerado automaticamente por indice.py · {now.strftime('%Y-%m-%d %H:%M UTC')} · HEAD `{head[:10] or 'n/d'}` · Não edite à mão.\n")
    L.append("Um sistema, três fontes de verdade, três produtores independentes. **Leia este arquivo e vá direto à fonte certa.** "
             "Cada fato tem um dono: se duas fontes discordarem, vale o dono.\n")
    L.append("## Onde está cada coisa\n")
    L.append("| Preciso de… | Fonte (dona do fato) | Onde ler | Estado |")
    L.append("|---|---|---|---|")
    by = {f["nome"]: f for f in fontes}
    for nome in ORDEM + [n for n in by if n not in ORDEM]:
        f = by.get(nome)
        if not f:
            continue
        desc, _ = ROTEIRO.get(nome, (f"Saída de `{f['caminho']}`", ""))
        estado = f["status"]
        if f["idade_min"] is not None:
            estado += f" · {f['idade_min']} min atrás" if f["idade_min"] < 120 else f" · {f['idade_min'] // 60}h atrás"
        if f["avisos"]:
            estado += " · ⚠️ " + "; ".join(f["avisos"])
        L.append(f"| {desc} | **{nome}** | {como_ler(f)} | {estado} |")
    L.append("")
    L.append("## Ordem de leitura antes de qualquer tarefa ou planejamento\n")
    for i, nome in enumerate([n for n in ORDEM if n in by] + [n for n in by if n not in ORDEM], 1):
        _, quando = ROTEIRO.get(nome, ("", ""))
        L.append(f"{i}. **{nome}** — {quando or 'conforme a tarefa'}.")
    L.append("")
    L.append("## Regras do protocolo\n")
    L.append("- Tabela/coluna/política existe? → **banco real**. Migrations do repo são histórico, não estado.")
    L.append("- Onde fica, quem chama, o que importa o quê? → **código**.")
    L.append("- Pode fazer isso? Qual estado vem depois? Qual o limite? → **regras de negócio** (inclui `manual/`, escrito por humanos, prioridade máxima).")
    L.append("- Item listado como **NÃO VERIFICADO** ou **inconsistência** em qualquer fonte: confirme na fonte dona antes de assumir.")
    L.append("- Nada aqui é editado à mão. Para registrar uma regra que só o negócio sabe, escreva em `manual/` da fonte de regras.")
    L.append("")
    for f in fontes:
        if f["local"] and f["arquivos"]:
            L.append(f"<details><summary>Arquivos de <b>{f['nome']}</b> (`{f['caminho']}/`)</summary>\n")
            L += [f"- `{f['caminho']}/{a}`" for a in f["arquivos"][:80]]
            if len(f["arquivos"]) > 80:
                L.append(f"- … +{len(f['arquivos']) - 80}")
            L.append("\n</details>\n")
    content = "\n".join(L).rstrip() + "\n"
    out.parent.mkdir(parents=True, exist_ok=True)
    # não reescreve se só o timestamp/idade mudou e nada estrutural
    strip = lambda t: re.sub(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC|\d+ min atrás|\d+h atrás|há \d+h\d{2}", "", t)
    if out.exists() and strip(out.read_text(encoding="utf-8")) == strip(content):
        print("[indice] sem mudança estrutural — não reescrito", file=sys.stderr)
        return 0
    out.write_text(content, encoding="utf-8")
    print(f"[indice] escrito {out} ({len(fontes)} fontes: " + ", ".join(f"{f['nome']}={f['status']}" for f in fontes) + ")", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
