import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getPortal,
  startPortalPurchase,
  getPortalPurchase,
  redeemPortalVoucher,
} from "@/lib/portal.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { CaptivePortalView } from "@/components/portal/CaptivePortalView";
import { toast } from "sonner";
import { Wifi } from "lucide-react";

export const Route = createFileRoute("/portal/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Hotspot Access Portal" },
      {
        name: "description",
        content: "Choose a Wi-Fi plan, pay with M-Pesa and get your hotspot access instantly.",
      },
      { property: "og:title", content: "Wi-Fi Hotspot Access" },
      {
        property: "og:description",
        content: "Pay with M-Pesa or redeem voucher for Wi-Fi access.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortalPage,
});

function PortalPage() {
  const { slug } = Route.useParams();
  const fetchPortal = useServerFn(getPortal);
  const startPay = useServerFn(startPortalPurchase);
  const checkPay = useServerFn(getPortalPurchase);
  const redeemVoucher = useServerFn(redeemPortalVoucher);

  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [redeemedData, setRedeemedData] = useState<{
    code: string;
    packageName: string;
    expiresAt: string | null;
  } | null>(null);

  // Extract router_id and mac from search parameters client-side
  const [routerId, setRouterId] = useState<string | null>(null);
  const [mac, setMac] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const rId =
        searchParams.get("router_id") || searchParams.get("routerId") || searchParams.get("router");
      if (rId) {
        setRouterId(rId);
      }
      const clientMac =
        searchParams.get("mac") || searchParams.get("client_mac") || searchParams.get("username");
      if (clientMac) {
        setMac(clientMac);
      }
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["portal", slug],
    queryFn: () => fetchPortal({ data: { slug } }),
  });

  const pay = useMutation({
    mutationFn: ({ packageId, phone }: { packageId: string; phone: string }) =>
      startPay({ data: { slug, packageId, phone, routerId, mac } }),
    onSuccess: (res) => {
      setCheckoutId(res.checkoutRequestId);
      setWaiting(true);
      toast.success(res.message ?? "Check your phone to enter your M-Pesa PIN");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const redeem = useMutation({
    mutationFn: (voucherCode: string) =>
      redeemVoucher({ data: { slug, code: voucherCode, routerId, mac } }),
    onSuccess: (res) => {
      setRedeemedData({
        code: res.code,
        packageName: res.packageName,
        expiresAt: res.expiresAt,
      });
      toast.success("Voucher activated successfully!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!checkoutId || !waiting) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const res = await checkPay({ data: { checkoutRequestId: checkoutId } });
      if (res.status === "success") {
        setCode(res.code);
        setWaiting(false);
        clearInterval(timer);
      } else if (res.status === "failed" || res.status === "cancelled") {
        setWaiting(false);
        clearInterval(timer);
        toast.error(res.failureReason ?? "Payment was not completed");
      } else if (tries > 40) {
        setWaiting(false);
        clearInterval(timer);
        toast.error("Still waiting for M-Pesa. Check your messages, then refresh.");
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [checkoutId, waiting, checkPay]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#07101E] flex flex-col items-center justify-center p-6 text-slate-100">
        <div className="w-full max-w-sm space-y-4">
          <Skeleton className="h-28 w-full rounded-2xl bg-slate-800" />
          <Skeleton className="h-64 w-full rounded-2xl bg-slate-800" />
          <Skeleton className="h-12 w-full rounded-xl bg-slate-800" />
        </div>
      </main>
    );
  }

  if (!data?.tenant) {
    return (
      <main className="min-h-screen bg-[#07101E] flex flex-col items-center justify-center p-6 text-center text-slate-100">
        <div className="w-full max-w-sm rounded-2xl bg-[#0D192E] border border-slate-800 p-8 space-y-3">
          <Wifi className="h-10 w-10 text-orange-500 mx-auto animate-pulse" />
          <h1 className="text-xl font-bold text-white">Hotspot Not Found</h1>
          <p className="text-sm text-slate-400">
            Check the link on your Wi-Fi login screen and try again.
          </p>
        </div>
      </main>
    );
  }

  return (
    <CaptivePortalView
      tenant={data.tenant}
      packages={data.packages}
      onPay={(packageId, phone) => pay.mutate({ packageId, phone })}
      onRedeemVoucher={(voucherCode) => redeem.mutate(voucherCode)}
      isPaymentPending={pay.isPending}
      isRedeemPending={redeem.isPending}
      isWaitingForPin={waiting}
      activeCode={code}
      redeemedData={redeemedData}
      onReset={() => {
        setCode(null);
        setRedeemedData(null);
        setCheckoutId(null);
        setWaiting(false);
      }}
    />
  );
}
