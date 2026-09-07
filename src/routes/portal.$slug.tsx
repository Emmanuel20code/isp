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
import { usePaymentStatus } from "@/hooks/usePaymentStatus";

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

  const [checkoutId, setCheckoutId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(`mpesa_checkout_${slug}`);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (checkoutId) {
      localStorage.setItem(`mpesa_checkout_${slug}`, checkoutId);
    } else {
      localStorage.removeItem(`mpesa_checkout_${slug}`);
    }
  }, [checkoutId, slug]);

  const [code, setCode] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(`mpesa_code_${slug}`);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (code) {
      localStorage.setItem(`mpesa_code_${slug}`, code);
    } else {
      localStorage.removeItem(`mpesa_code_${slug}`);
    }
  }, [code, slug]);

  const [waiting, setWaiting] = useState(false);

  // If we have a checkoutId on load, start waiting
  useEffect(() => {
    if (checkoutId && !code) {
      setWaiting(true);
    }
  }, [checkoutId, code]);

  const [redeemedData, setRedeemedData] = useState<{
    code: string;
    packageName: string;
    expiresAt: string | null;
  } | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem(`portal_redeemed_${slug}`);
    try {
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // If the saved session is already expired, don't load it
      if (parsed.expiresAt) {
        const expiry = new Date(parsed.expiresAt).getTime();
        const now = new Date().getTime();
        if (expiry <= now) {
          localStorage.removeItem(`portal_redeemed_${slug}`);
          localStorage.removeItem(`mpesa_code_${slug}`); // Also clear code if expired
          return null;
        }
      }
      return parsed;
    } catch {
      return null;
    }
  });

  // Ensure code state is consistent with redeemedData in initializer
  useEffect(() => {
    if (redeemedData && !code) {
      setCode(redeemedData.code);
    }
  }, [redeemedData, code]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (redeemedData) {
      localStorage.setItem(`portal_redeemed_${slug}`, JSON.stringify(redeemedData));
    } else {
      localStorage.removeItem(`portal_redeemed_${slug}`);
    }
  }, [redeemedData, slug]);

  // Extract router_id and mac from search parameters client-side
  const [routerId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const searchParams = new URLSearchParams(window.location.search);
    return (
      searchParams.get("router_id") || searchParams.get("routerId") || searchParams.get("router")
    );
  });
  const [mac] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const searchParams = new URLSearchParams(window.location.search);
    const val =
      searchParams.get("mac") || searchParams.get("client_mac") || searchParams.get("username");
    return val ? val.trim().toUpperCase() : null;
  });
  const [ip] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get("ip") || searchParams.get("client_ip") || null;
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal", slug, routerId, mac],
    queryFn: () => fetchPortal({ data: { slug, routerId, mac } }),
  });

  // Effect to sync session data if found on load, OR clear if server says no session
  useEffect(() => {
    // If server says there's an active session, sync it
    if (data?.activeSession) {
      // Only sync if we don't have one or if it's different from current
      if (!redeemedData || redeemedData.code !== data.activeSession.code) {
        setRedeemedData(data.activeSession);
        setCode(data.activeSession.code);
      }
    }
    // If we have local state but server says NO active session (server filters expired out),
    // and our local state is expired, we should clear it to show packages.
    else if (data && !data.activeSession && redeemedData?.expiresAt) {
      const expiry = new Date(redeemedData.expiresAt).getTime();
      const now = new Date().getTime();
      if (expiry <= now) {
        setRedeemedData(null);
        setCode(null);
      }
    }
    // If server says no session and we have a "code" but no "redeemedData" (stale code), clear it
    else if (data && !data.activeSession && !redeemedData && code) {
      setCode(null);
    }
  }, [data, redeemedData, code]);

  const pay = useMutation({
    mutationFn: ({
      packageId,
      phone,
      username,
      customerId,
    }: {
      packageId: string;
      phone: string;
      username?: string;
      customerId?: string;
    }) =>
      startPay({
        data: {
          slug,
          packageId,
          phone,
          username,
          customerId,
          routerId,
          mac,
          ip: ip || data?.detectedIp,
        },
      }),
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

  const {
    paymentStatus,
    isInternetGranted,
    isPolling,
    elapsedSeconds,
    isTimedOut,
    retryPolling,
    cancelPolling,
  } = usePaymentStatus(
    checkoutId,
    async (id) => {
      const res = await checkPay({ data: { checkoutRequestId: id } });
      return res;
    },
    {
      intervalMs: 2000,
      timeoutSeconds: 90,
    },
  );

  useEffect(() => {
    if (isInternetGranted && paymentStatus?.status === "success") {
      const codeValue = paymentStatus.code || null;
      setCode(codeValue);

      if (paymentStatus.code && paymentStatus.packageName) {
        setRedeemedData({
          code: paymentStatus.code,
          packageName: paymentStatus.packageName,
          expiresAt: paymentStatus.expiresAt || null,
          kind: paymentStatus.kind || "hotspot",
        });
      }
      setWaiting(false);
      setCheckoutId(null);

      // Auto-connect if we have a code and the browser supports it
      if (codeValue) {
        console.log("[Portal] Auto-connecting with code:", codeValue);
      }
    } else if (paymentStatus?.status === "failed") {
      setWaiting(false);
      setCheckoutId(null);
    }
  }, [isInternetGranted, paymentStatus]);

  if (error) {
    return (
      <main className="min-h-screen bg-[#07101E] flex flex-col items-center justify-center p-6 text-center text-slate-100">
        <div className="w-full max-w-sm rounded-2xl bg-[#0D192E] border border-slate-800 p-8 space-y-3">
          <Wifi className="h-10 w-10 text-red-500 mx-auto" />
          <h1 className="text-xl font-bold text-white">Connection Error</h1>
          <p className="text-sm text-slate-400">
            Failed to load portal configuration. Please try again.
          </p>
        </div>
      </main>
    );
  }

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
      slug={slug}
      tenant={data.tenant}
      packages={data.packages}
      onPay={(packageId, phone, pppoeDetails) =>
        pay.mutate({
          packageId,
          phone,
          username: pppoeDetails?.username,
          customerId: pppoeDetails?.customerId,
        })
      }
      onRedeemVoucher={(voucherCode) => redeem.mutate(voucherCode)}
      isPaymentPending={pay.isPending}
      isRedeemPending={redeem.isPending}
      isWaitingForPin={waiting}
      isPolling={isPolling}
      isTimedOut={isTimedOut}
      elapsedSeconds={elapsedSeconds}
      onRetryPolling={retryPolling}
      onCancelPolling={() => {
        cancelPolling();
        setWaiting(false);
        setCheckoutId(null);
      }}
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
