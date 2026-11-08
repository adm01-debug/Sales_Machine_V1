# scripts/ci — guardas dos scripts autônomos

`node --test "scripts/ci/*.unit.mjs"` (Node puro, sem rede, sem banco). São os testes que impedem os
geradores de contexto de mentir. Quatro são próprios deste diretório e quatro apenas reaproveitam a
suíte do produtor para que ela rode num só comando. Este README cobre os guardas dos **scripts
autônomos**; outros `*.unit.mjs` que apareçam aqui têm dono próprio.

| Arquivo | Garante |
|---|---|
| `inventario-banco.unit.mjs` | funções puras de `scripts/inventario/gerar-banco.mjs`: leitura da resposta do MCP/API, conferência de origem (tipos gerados + ledger de migrations), órfãs, alertas, ordenação estável e trava de credencial |
| `inventario-repo.unit.mjs` | `gerar-repo.mjs`: edge functions, segredos lidos e quem chama cada uma |
| `inventario-mudou.unit.mjs` | `mudou-conteudo.mjs`: o que conta como mudança de conteúdo (e o que é só carimbo de data ou telemetria rolante) |
| `contexto-indice.unit.mjs` | `indice.py`: estado de cada fonte no `00-INDEX.md` (ok, parcial, desatualizado, ausente) |
| `contexto-publicacao.unit.mjs` | o passo de publicação do `contexto.yml`: extrai o shell real do workflow e o executa contra um repositório Git local — produtor que falha mantém a versão anterior da sua pasta, erro de download não publica nada |
| `ai-context-generator.unit.mjs` | importa `scripts/ai-context/gerar.unit.mjs` |
| `regras-negocio.unit.mjs` | roda `scripts/regras_negocio/test_generate.py` e testa `publish.sh` |
| `supabase-snapshot.unit.mjs` | roda `scripts/supabase_snapshot/test_snapshot.py` |

Não há CI obrigatório neste repo (ver `CLAUDE.md`): `contexto.yml` e `inventario-estado-semanal.yml`
rodam as suítes dos produtores antes de gerar, e rodar `node --test "scripts/ci/*.unit.mjs"` local é
obrigação de quem mexe em `scripts/`.
