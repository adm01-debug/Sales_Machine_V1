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
  ShieldCheck,
  Workflow,
  ClipboardList,
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
      { to: "/journeys", label: "Jornadas", icon: Workflow },
      { to: "/forms", label: "Formulários", icon: ClipboardList },
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
      { to: "/compliance", label: "Conformidade", icon: ShieldCheck },
      { to: "/evals", label: "Avaliações de agente", icon: FlaskConical },
    ],
  },
];
