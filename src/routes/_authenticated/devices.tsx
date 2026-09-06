import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listDevices,
  listDeviceRouters,
  addDevice,
  toggleDeviceStatus,
  deleteDevice,
} from "@/lib/devices.functions";
import { getMyContext } from "@/lib/tenancy.functions";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Trash2, Tv, Plus, Pause, Play, Scan, Activity } from "lucide-react";
import { MacScannerModal } from "@/components/MacScannerModal";

export const Route = createFileRoute("/_authenticated/devices")({
  head: () => ({
    meta: [
      { title: "Bound Devices · Wifi Billing" },
      {
        name: "description",
        content: "Bypass captive portal for Smart TVs and specific MAC addresses.",
      },
    ],
  }),
  component: DevicesPage,
});

function DevicesPage() {
  const queryClient = useQueryClient();
  const fetchContext = useServerFn(getMyContext);
  const fetchDevices = useServerFn(listDevices);
  const fetchRouters = useServerFn(listDeviceRouters);
  const callAddDevice = useServerFn(addDevice);
  const callToggleStatus = useServerFn(toggleDeviceStatus);
  const callDeleteDevice = useServerFn(deleteDevice);

  const ctx = useQuery({ queryKey: ["my-context"], queryFn: () => fetchContext() });
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => fetchDevices() });
  const routersQuery = useQuery({ queryKey: ["device-routers"], queryFn: () => fetchRouters() });

  const [mac, setMac] = useState("");
  const [name, setName] = useState("");
  const [routerId, setRouterId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const routers =
    routersQuery.data && routersQuery.data.length > 0
      ? routersQuery.data
      : (ctx.data?.routers ?? []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!mac || !name) return;
    setIsSubmitting(true);
    try {
      const targetRouterId = !routerId || routerId === "all" ? null : routerId;
      await callAddDevice({
        data: {
          fullName: name,
          macAddress: mac,
          routerId: targetRouterId,
        },
      });
      toast.success("Device bound successfully");
      setMac("");
      setName("");
      setRouterId("");
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add device");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleStatus(id: string, currentStatus: string) {
    setUpdatingId(id);
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    try {
      await callToggleStatus({ data: { id, status: newStatus } });
      toast.success(newStatus === "active" ? "Device activated" : "Device suspended");
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  }

  async function confirmDelete() {
    if (!deviceToDelete) return;
    setUpdatingId(deviceToDelete);
    try {
      await callDeleteDevice({ data: { id: deviceToDelete } });
      toast.success("Device binding removed");
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setDeviceToDelete(null);
    } catch (err) {
      toast.error("Failed to delete device");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold font-display tracking-tight flex items-center gap-3">
            <Tv className="size-8 text-primary" />
            Bound Devices
          </h1>
          <p className="text-muted-foreground">
            Manually bind MAC addresses (like Smart TVs) to bypass the captive portal.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setScannerOpen(true)}
          className="gap-2 font-semibold text-primary border-primary/30 hover:bg-primary/10"
        >
          <Activity className="size-4" /> Scan Network MACs
        </Button>
      </div>

      <div className="grid lg:grid-cols-[1fr_350px] gap-6 items-start">
        <div className="flex flex-col gap-4">
          {devices.isPending ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : devices.data?.length === 0 ? (
            <Card className="border-dashed bg-muted/30">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Scan className="size-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-xl font-medium mb-1">No bound devices</h3>
                <p className="text-muted-foreground mb-4">
                  Add a device MAC address to grant it immediate internet access.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setScannerOpen(true)}
                  className="gap-2 text-primary border-primary/30 hover:bg-primary/10"
                >
                  <Activity className="size-4" /> Scan Connected MACs
                </Button>
              </CardContent>
            </Card>
          ) : (
            devices.data?.map(
              (device: {
                id: string;
                full_name: string;
                status: string;
                mac_address: string;
                routers?: { name: string };
              }) => (
                <Card key={device.id} className={device.status !== "active" ? "opacity-75" : ""}>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h4 className="font-semibold text-lg flex items-center gap-2">
                          {device.full_name}
                          {device.status === "active" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-none">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Suspended</Badge>
                          )}
                        </h4>
                        <p className="font-mono text-sm text-muted-foreground mt-1">
                          MAC: {device.mac_address}
                        </p>
                        {device.routers?.name && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Router: {device.routers.name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant={device.status === "active" ? "secondary" : "default"}
                          size="sm"
                          disabled={updatingId === device.id}
                          onClick={() => handleToggleStatus(device.id, device.status)}
                          className="gap-2"
                        >
                          {updatingId === device.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : device.status === "active" ? (
                            <Pause className="size-4" />
                          ) : (
                            <Play className="size-4" />
                          )}
                          {device.status === "active" ? "Suspend" : "Activate"}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={updatingId === device.id}
                          onClick={() => setDeviceToDelete(device.id)}
                          className="gap-2"
                        >
                          {updatingId === device.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ),
            )
          )}
        </div>

        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-5 text-primary" /> Add Device Binding
            </CardTitle>
            <CardDescription>Bypass captive portal for this MAC</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="mac">MAC Address</Label>
                <Input
                  id="mac"
                  placeholder="e.g. A1:B2:C3:D4:E5:F6"
                  value={mac}
                  onChange={(e) => setMac(e.target.value)}
                  className="uppercase font-mono"
                  required
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <strong>Tip for Phones:</strong> Android & iPhones use a &ldquo;Randomized
                  MAC&rdquo; by default for each Wi-Fi network. In phone Wi-Fi settings, set MAC
                  type to <em>&ldquo;Use device MAC&rdquo;</em>, or enter the Wi-Fi specific
                  randomized MAC shown in your connection details.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Device Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Living Room TV"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="routerId">Router</Label>
                  <Link to="/routers" className="text-xs text-primary hover:underline">
                    Manage Routers
                  </Link>
                </div>
                <Select value={routerId} onValueChange={setRouterId}>
                  <SelectTrigger id="routerId">
                    <SelectValue
                      placeholder={
                        routersQuery.isLoading ? "Loading routers..." : "Select a router (or All)"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {routers.length > 0 ? (
                      <>
                        <SelectItem value="all">
                          <span className="font-medium">All Routers (Network-wide bypass)</span>
                        </SelectItem>
                        {routers.map((r: { id: string; name: string; status?: string }) => (
                          <SelectItem key={r.id} value={r.id}>
                            <span className="flex items-center gap-2">
                              <span>{r.name}</span>
                              {r.status === "online" ? (
                                <span className="text-[10px] bg-emerald-500/15 text-emerald-600 px-1.5 py-0.5 rounded font-medium">
                                  Online
                                </span>
                              ) : (
                                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                                  Offline
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    ) : routersQuery.isLoading ? (
                      <SelectItem value="loading" disabled>
                        Loading routers...
                      </SelectItem>
                    ) : (
                      <SelectItem value="all">
                        <span className="font-medium">All Routers (Default)</span>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {routers.length === 0 && !routersQuery.isLoading && (
                  <p className="text-xs text-amber-500">
                    No routers onboarded yet. Devices will bind automatically once a router is
                    connected in{" "}
                    <Link to="/routers" className="underline font-medium hover:text-amber-400">
                      Routers
                    </Link>
                    .
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <Button type="submit" disabled={isSubmitting || !mac || !name}>
                  {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Bind Device
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setScannerOpen(true)}
                  className="text-xs text-primary border-primary/20 hover:bg-primary/5 gap-1.5"
                >
                  <Activity className="size-3.5" />
                  Auto-Discover MAC from Router
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Live MikroTik MAC Scanner Modal */}
      <MacScannerModal open={scannerOpen} onOpenChange={setScannerOpen} />

      <AlertDialog
        open={!!deviceToDelete}
        onOpenChange={(open) => !open && setDeviceToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this device binding?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the device from the network. The device will be disconnected and will
              need to authenticate via the captive portal next time it connects. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
