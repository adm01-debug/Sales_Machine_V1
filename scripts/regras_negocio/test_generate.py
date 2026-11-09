"""Regressões offline do gerador de regras; não acessam banco nem APIs de LLM."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("generate.py")
SPEC = importlib.util.spec_from_file_location("context_rules_generate", SCRIPT)
generator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generator)


class CurrentSqlSourcesTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="context-rules-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.files = []

    def write(self, name, content):
        file = self.root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content, encoding="utf-8")
        self.files.append(file)
        return file

    def schema(self):
        return generator.parse_sql_schema(self.root, self.files)

    def test_foreign_migration_cannot_replace_current_table(self):
        current = "supabase/migrations/20260101000000_orders.sql"
        self.write(current, "CREATE TABLE public.orders (id uuid, created_at timestamptz);")
        self.write("supabase/migrations/_foreign/another-project/20250101000000_orders.sql",
                   "CREATE TABLE public.orders (id uuid, changed_at timestamptz);")
        schema = self.schema()
        self.assertEqual([c["name"] for c in schema["tables"]["orders"]["columns"]], ["id", "created_at"])
        self.assertEqual(schema["tables"]["orders"]["src"], current)
        self.assertEqual(schema["sources"], [current])

    def test_superseded_migration_cannot_undo_current_changes(self):
        self.write("supabase/migrations/20260101000000_orders.sql", "CREATE TABLE public.orders (id uuid);")
        self.write("supabase/migrations/20260102000000_status.sql", "ALTER TABLE public.orders ADD COLUMN status text;")
        self.write("supabase/migrations/_superseded/20250101000000_orders.sql", "DROP TABLE public.orders;")
        schema = self.schema()
        self.assertIn("orders", schema["tables"])
        self.assertEqual([c["name"] for c in schema["tables"]["orders"]["columns"]], ["id", "status"])
        self.assertEqual(len(schema["sources"]), 2)

    def test_archived_objects_do_not_contribute_to_schema_or_rules(self):
        sql = """
CREATE TYPE order_state AS ENUM ('open', 'done');
CREATE TABLE public.orders (id uuid PRIMARY KEY, status order_state DEFAULT 'open', amount numeric CHECK (amount >= 0));
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_select ON public.orders FOR SELECT TO authenticated USING (true);
CREATE FUNCTION public.ensure_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'amount cannot be negative';
  RETURN NEW;
END;
$$;
CREATE TRIGGER ensure_order_before BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.ensure_order();
CREATE INDEX orders_status ON public.orders (status);
CREATE VIEW public.open_orders AS SELECT * FROM public.orders;
GRANT SELECT ON public.orders TO authenticated;
COMMENT ON TABLE public.orders IS 'Current orders';
SELECT cron.schedule('daily_orders', '0 0 * * *', $$SELECT 1$$);
"""
        self.write("supabase/migrations/20260101000000_orders.sql", sql)
        self.write("supabase/seed.sql", "INSERT INTO public.orders (id) VALUES ('current');")
        expected = self.schema()
        for key in ("tables", "policies", "triggers", "functions", "enums", "indexes", "cron_jobs",
                    "views", "rls", "grants", "raises", "seed", "comments"):
            self.assertTrue(expected[key], key)
        self.write("supabase/migrations/_foreign/old-project/20240101000000_schema.sql",
                   sql.replace("orders", "foreign_orders").replace("order_state", "foreign_state").replace("ensure_order", "ensure_foreign"))
        self.write("supabase/migrations/_superseded/20240102000000_seed.sql", "INSERT INTO public.orders (id) VALUES ('historical');")
        self.assertEqual(self.schema(), expected)

    def test_archive_only_repository_has_no_current_sql_schema(self):
        self.write("db/migrations/_foreign/old.sql", "CREATE TABLE old_foreign (id uuid);")
        self.write("db/migrations/_superseded/old.sql", "CREATE TABLE old_superseded (id uuid);")
        schema = self.schema()
        self.assertEqual(schema["sources"], [])
        self.assertEqual(schema["tables"], {})

    def test_exact_directory_names_leave_other_sql_sources_visible(self):
        # O nome de um diretório acima da raiz do repo não muda seu significado.
        self.root = self.root / "_foreign" / "project"
        paths = [
            "supabase/migrations/_foreign.sql",
            "supabase/migrations/_superseded.sql",
            "supabase/migrations/customer_foreign/active.sql",
            "supabase/migrations/_superseded_backup/active.sql",
            "packages/store/prisma/migrations/20260101/active.sql",
            "db/current.sql",
            "sql/current.sql",
            "database/current.sql",
            "prisma/current.sql",
            "custom/schema.sql",
        ]
        for index, name in enumerate(paths):
            self.write(name, f"CREATE TABLE current_{index} (id uuid);")
        schema = self.schema()
        self.assertEqual(schema["sources"], sorted(paths))
        self.assertEqual(set(schema["tables"]), {f"current_{i}" for i in range(len(paths))})

    def test_current_prisma_and_types_fallback_remain_available(self):
        self.write("prisma/schema.prisma", "model Store {\n id String @id\n}\n")
        self.write("src/database.types.ts", """
export type Database = {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string
        }
      }
    }
  }
}
""")
        schema = self.schema()
        self.assertEqual(set(schema["tables"]), {"Store", "customers"})
        self.assertEqual(schema["tables"]["Store"]["origin"], "prisma")
        self.assertEqual(schema["tables"]["customers"]["origin"], "types.ts")

    def test_archived_sql_is_not_current_code_but_remains_in_file_inventory(self):
        current = self.write("supabase/migrations/20260101000000_retention.sql", "SELECT now() - interval '7 days';")
        archived = self.write("supabase/migrations/_superseded/20250101000000_retention.sql", "SELECT now() - interval '365 days';")
        self.assertTrue(generator.analyze_code_file(current, self.root)["temporal"])
        self.assertIsNone(generator.analyze_code_file(archived, self.root))
        files = generator.walk_repo(self.root, self.root / "output")
        self.assertEqual(set(files), {current, archived})

    def test_cli_rules_profile_uses_current_schema_and_temporal_rules(self):
        current = "supabase/migrations/20260101000000_orders.sql"
        archived = "supabase/migrations/_superseded/20250101000000_orders.sql"
        self.write(current, "CREATE TABLE public.orders (id uuid, created_at timestamptz);\nSELECT now() - interval '7 days';")
        self.write(archived, "CREATE TABLE public.orders (id uuid, historical_status text);\nSELECT now() - interval '365 days';")
        subprocess.run([sys.executable, str(SCRIPT), "--repo", str(self.root), "--out", "output",
                        "--profile", "regras", "--no-pointer"], check=True, capture_output=True, text=True, timeout=30)
        context = json.loads((self.root / "output/context.json").read_text(encoding="utf-8"))
        self.assertEqual(context["schema"]["sources"], [current])
        self.assertEqual([c["name"] for c in context["schema"]["tables"]["orders"]["columns"]], ["id", "created_at"])
        self.assertEqual(context["rules"]["temporal"], [{"file": current, "line": "SELECT now() - interval '7 days';"}])
        self.assertIn(current, context["code_files"])
        self.assertNotIn(archived, context["code_files"])
        self.assertEqual(context["meta"]["files_total"], 2)
        rendered = (self.root / "output/07-REGRAS-DE-NEGOCIO.md").read_text(encoding="utf-8")
        self.assertIn("7 days", rendered)
        self.assertNotIn("365 days", rendered)
        self.assertNotIn("historical_status", rendered)
        self.assertFalse((self.root / "AGENTS.md").exists())


if __name__ == "__main__":
    unittest.main()
