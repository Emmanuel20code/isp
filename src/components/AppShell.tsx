import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getPublicSettings } from "@/lib/public.functions";
import { useTenant } from "@/context/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Users,
  Tv,
  Ticket,
  Package,
  Receipt,
  Router as RouterIcon,
  Settings,
  Shield,
  Bell,
  Zap,
  Search,
  Sun,
  Menu,
  UserCircle,
  ChevronDown,
  LogOut,
  Headphones,
  CreditCard,
  Layers,
  Bot,
} from "lucide-react";

type Item = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  to?: string;
  tag?: string;
};

function useMenu(isSuperAdmin: boolean): Item[] {
  return useMemo(
    () => [
      { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
      { label: "AI Operations", icon: Bot, to: "/ai-operations" },
      { label: "Data Grid", icon: Layers, to: "/datagrid" },
      { label: "PPPoE Manager", icon: Zap, to: "/pppoe" },
      { label: "Customers", icon: Users, to: "/customers" },
      { label: "Bound Devices", icon: Tv, to: "/devices" },
      { label: "Vouchers", icon: Ticket, to: "/vouchers" },
      { label: "Packages", icon: Package, to: "/packages" },
      { label: "Transactions", icon: Receipt, to: "/transactions" },
      { label: "Routers", icon: RouterIcon, to: "/routers" },
      { label: "Subscription", icon: Zap, to: "/subscription" },
      { label: "Payment Gateways", icon: CreditCard, to: "/gateways" },
      { label: "Settings", icon: Settings, to: "/settings" },
      ...(isSuperAdmin ? [{ label: "Super admin", icon: Shield, to: "/superadmin" } as Item] : []),
    ],
    [isSuperAdmin],
  );
}

function SidebarNav({
  isSuperAdmin,
  pathname,
  onNavigate,
}: {
  isSuperAdmin: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const [q, setQ] = useState("");
  const items = useMenu(isSuperAdmin).filter((i) =>
    i.label.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search menu..."
            className="h-8 rounded-sm border-sidebar-border bg-background/40 pl-8 text-xs"
          />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto pb-6">
        {items.map((item) => {
          const active = item.to === pathname;
          const content = (
            <>
              <item.icon className="size-4 shrink-0 opacity-80" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.tag && (
                <Badge className="h-4 rounded-sm bg-success px-1 text-[9px] font-semibold text-success-foreground hover:bg-success">
                  {item.tag}
                </Badge>
              )}
            </>
          );
          const cls = `flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-[13px] transition-colors ${
            active
              ? "border-primary bg-primary/15 text-primary"
              : "border-transparent text-sidebar-foreground/80 hover:bg-white/5 hover:text-sidebar-foreground"
          }`;
          return item.to ? (
            <Link key={item.label} to={item.to} onClick={onNavigate} className={cls}>
              {content}
            </Link>
          ) : (
            <button key={item.label} type="button" className={`${cls} cursor-default`}>
              {content}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function AppShell({
  children,
  isSuperAdmin = false,
  title,
}: {
  children: ReactNode;
  isSuperAdmin?: boolean | undefined;
  title?: string | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const fetchSettings = useServerFn(getPublicSettings);
  const settings = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => fetchSettings(),
    staleTime: Infinity,
  });

  const { country, selectedPaymentProvider, setSelectedPaymentProvider } = useTenant();
  const flagMap: Record<string, { flag: string; code: string }> = {
    Kenya: { flag: "🇰🇪", code: "KE" },
    Tanzania: { flag: "🇹🇿", code: "TZ" },
    Uganda: { flag: "🇺🇬", code: "UG" },
    Rwanda: { flag: "🇷🇼", code: "RW" },
  };
  const currentFlag = flagMap[country] || { flag: "🇰🇪", code: "KE" };

  const supportPhone = settings.data?.supportPhone || "254712345678";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="hidden border-r border-sidebar-border lg:block">
        <div className="sticky top-0 h-screen overflow-hidden">
          <SidebarNav isSuperAdmin={isSuperAdmin} pathname={pathname} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center gap-2 border-b border-border bg-sidebar px-3 py-2.5">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[230px] p-0">
              <SidebarNav
                isSuperAdmin={isSuperAdmin}
                pathname={pathname}
                onNavigate={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <span className="truncate font-display text-sm font-semibold">
            {title ?? "Wifi Billing ISP Manager"}
          </span>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-3 py-2">
          <div className="relative min-w-[150px] flex-1 max-w-xs">
            <Input placeholder="Search users..." className="h-8 rounded-sm pr-9 text-xs" />
            <span className="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-r-sm bg-primary text-primary-foreground">
              <Search className="size-3.5" />
            </span>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-sm text-xs">
            <Sun className="size-3.5" /> Light
          </Button>
          <span className="flex items-center gap-1 text-xs text-muted-foreground" title={country}>
            {currentFlag.flag} {currentFlag.code}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                <Zap className="size-3.5" /> Quick Actions <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => navigate({ to: "/pppoe" })}>
                PPPoE Manager
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/routers" })}>
                Add router
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/packages" })}>
                Add package
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/customers" })}>
                Add customer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/vouchers" })}>
                Generate vouchers
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="relative ml-auto">
            <Bell className="size-4 text-muted-foreground" />
            <span className="absolute -right-1.5 -top-1.5 grid size-3.5 place-items-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
              0
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                <UserCircle className="size-4" /> Administrator
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <main className="px-3 py-4 sm:px-4">{children}</main>

        <button
          type="button"
          onClick={() => window.open(`https://wa.me/${supportPhone}`, "_blank")}
          className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg"
        >
          <Headphones className="size-4" /> Support
        </button>
      </div>
    </div>
  );
}
