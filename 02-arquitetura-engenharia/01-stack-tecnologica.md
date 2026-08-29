# Stack Tecnológica — Sales_Machine_V1

> Versões exatas conforme `package.json` (2026-08-29). Lib nova ou bump de major **exige aprovação** (matriz de autonomia).

## Runtime & linguagem
| Item | Versão | Nota |
|---|---|---|
| TypeScript | ^5.8.3 | strict |
| React / React DOM | ^19.2.0 | |
| Node | 22 (tipos ^22.16.5) | runtime de referência |
| **bun** | — | **gerenciador canônico** (`bunfig.toml`); nunca npm/yarn |
| Vite | ^8.0.16 | dev server + build |
| Nitro | 3.0.260603-beta | server runtime do TanStack Start |

## Framework & dados
| Item | Versão | Uso |
|---|---|---|
| @tanstack/react-start | ^1.168.26 | app full-stack (SSR + server routes) |
| @tanstack/react-router | ^1.170.16 | file-based routing (`routeTree.gen.ts` é gerado — não editar) |
| @tanstack/react-query | ^5.101.1 | estado server-side no client |
| @supabase/supabase-js | ^2.110.7 | client do banco |
| zod | ^3.24.2 | validação (server fns + webhooks) |
| PostgreSQL | (Supabase Cloud) | schema `public`, RLS, pg_cron, pg_net |

## UI
Tailwind CSS ^4.2.1 (`@tailwindcss/vite`) · shadcn/ui sobre Radix (accordion…tooltip) · lucide-react ^0.575 · recharts ^2.15 · sonner · react-hook-form ^7.71 + @hookform/resolvers · cmdk · vaul · embla · date-fns.

## Qualidade
Vitest ^4.1.10 (`bun test`) · ESLint ^9.32 (flat config) + typescript-eslint ^8.56 · Prettier ^3.7.3 (+ eslint-plugin-prettier) · @lovable.dev/vite-tanstack-config 2.8.5 · @lovable.dev/cloud-auth-js ^1.1.2.

## Integrações (clients em `src/integrations/external/`)
LUX · SINGU · FATOR X · FUXICO — REST + HMAC (ver `05-contratos-api.md`). Sociais (LinkedIn/Instagram): stubs atrás do adapter `SocialSender` (`src/integrations/social/`).

## Ferramentas de contexto (PromptOps)
`scripts/gerar-dump-arquitetura.py` (Python 3, stdlib only) — regera `.contexto-compartilhado/dump-arquitetura.json` a partir das migrations + rotas.

## Proibidos / fora da stack
- npm/yarn como gerenciador · Next.js/Remix conventions (ver `src/routes/README.md`) · Trigger.dev/Inngest (decisão: pg_cron basta) · ORM pesado (acesso via supabase-js direto).
