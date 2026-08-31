import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listNetwork } from "@/lib/network.functions";
import { getMyContext } from "@/lib/tenancy.functions";
import { AppShell } from "@/components/AppShell";
import {
  TenantDataGrid,
  GridRouter,
  GridPackage,
  GridTenantMpesa,
} from "@/components/TenantDataGrid";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/datagrid")({
  head: () => ({
    meta: [
      { title: "Resource Data Grid · Wifi Billing Wi-Fi Billing" },
      {
        name: "description",
        content:
          "Manage router credentials, M-Pesa till numbers, and package definitions in the database.",
      },
      { property: "og:title", content: "Resource Data Grid · Wifi Billing" },
      {
        property: "og:description",
        content: "Interactive data grid for routers, M-Pesa shortcodes, and packages.",
      },
    ],
  }),
  component: DataGridPage,
});

function DataGridPage() {
  const qc = useQueryClient();
  const fetchNetwork = useServerFn(listNetwork);
  const fetchContext = useServerFn(getMyContext);

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const network = useQuery({
    queryKey: ["network"],
    queryFn: () => fetchNetwork(),
    refetchInterval: 10_000,
  });

  const tenant = ctx.data?.tenant;

  const mpesaConfig: GridTenantMpesa | undefined = tenant
    ? {
        shortcode: tenant.mpesa_shortcode ?? null,
        shortcodeKind: (tenant.mpesa_shortcode_kind as "till" | "paybill") ?? null,
        accountRef: (tenant.mpesa_account_ref as string) ?? null,
        country: tenant.country ?? "Kenya",
      }
    : undefined;

  const routers: GridRouter[] = (network.data?.routers ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    location: r.location,
    status: r.status as "online" | "offline" | "pending",
    agent_key: r.agent_key,
    onboard_token: r.onboard_token,
    onboard_token_expires_at: r.onboard_token_expires_at,
    public_ip: r.public_ip,
    ros_version: r.ros_version,
    active_hotspot_users: r.active_hotspot_users,
    active_pppoe_users: r.active_pppoe_users,
    last_seen_at: r.last_seen_at,
    created_at: r.created_at,
  }));

  const packages: GridPackage[] = (network.data?.packages ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind as "hotspot" | "pppoe",
    price_kes: p.price_kes,
    duration_hours: Number(p.duration_hours),
    speed_down_mbps: p.speed_down_mbps,
    speed_up_mbps: p.speed_up_mbps,
    device_limit: p.device_limit,
    is_active: p.is_active,
    created_at: p.created_at,
  }));

  return (
    <AppShell isSuperAdmin={ctx.data?.isSuperAdmin ?? false} title={tenant?.name ?? undefined}>
      {network.isPending || ctx.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : (
        <TenantDataGrid
          routers={routers}
          packages={packages}
          mpesa={mpesaConfig}
          initialTab="all"
          onRefresh={() => {
            qc.invalidateQueries({ queryKey: ["network"] });
            qc.invalidateQueries({ queryKey: ["my-context"] });
          }}
          isRefreshing={network.isFetching || ctx.isFetching}
        />
      )}
    </AppShell>
  );
}
