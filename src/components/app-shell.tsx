import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/components/nav-config";

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border surface-glass px-4 py-3 lg:hidden">
        <span className="font-semibold tracking-tight text-gradient-primary">Sales Machine</span>
        <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </header>

      <div className="flex">
        <aside
          className={cn(
            "fixed inset-x-0 top-[57px] z-20 border-b border-sidebar-border bg-sidebar p-4 text-sidebar-foreground lg:static lg:block lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r",
            open ? "block" : "hidden",
          )}
        >
          <div className="mb-6 hidden lg:block">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-primary shadow-glow" aria-hidden />
              <p className="text-lg font-bold tracking-tight text-gradient-primary">
                Sales Machine
              </p>
            </div>
            <p className="mt-1 text-xxs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Marketing · LUX · SINGU · FATOR X
            </p>
          </div>
          <nav className="space-y-5 lg:h-[calc(100vh-9rem)] lg:overflow-y-auto">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1">
                <p className="px-2 text-xxs font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-accent-foreground data-[status=active]:[&_svg]:text-primary"
                    activeOptions={{ exact: item.exact ?? false }}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="mt-5 border-t border-border pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={handleSignOut}
            >
              Sair
            </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
