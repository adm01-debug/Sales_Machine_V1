import {
  LayoutDashboard,
  Users,
  Megaphone,
  Target,
  Contact,
  Library,
  CheckCircle2,
  Activity,
  MailCheck,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Marketing",
    items: [
      { to: "/dashboard", label: "Visão Geral", icon: LayoutDashboard, exact: true },
      { to: "/audiences", label: "Audiências", icon: Users },
      { to: "/campaigns", label: "Campanhas", icon: Megaphone },
      { to: "/library", label: "Biblioteca", icon: Library },
    ],
  },
  {
    label: "Relacionamento",
    items: [
      { to: "/contacts", label: "Contatos & Contas", icon: Contact },
      { to: "/prospecting", label: "Prospecção", icon: Target },
      { to: "/approvals", label: "Aprovações", icon: CheckCircle2 },
    ],
  },
  {
    label: "Operações",
    items: [
      { to: "/ops", label: "Saúde do pipeline", icon: Activity },
      { to: "/deliverability", label: "Entregabilidade", icon: MailCheck },
      { to: "/evals", label: "Avaliações de agente", icon: FlaskConical },
    ],
  },
];