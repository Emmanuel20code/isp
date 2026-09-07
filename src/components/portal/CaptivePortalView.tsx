import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PortalPackage, PortalTenantSettings, lookupPPPoECustomer } from "@/lib/portal.functions";
import { useServerFn } from "@tanstack/react-start";
import { formatPackageDuration } from "@/lib/billing-helpers";
import { getCurrencyByCountry } from "@/lib/payment-providers";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Wifi,
  CheckCircle2,
  Copy,
  Ticket,
  PhoneCall,
  Zap,
  ArrowRight,
  Clock,
  Sparkles,
  Info,
  ShieldCheck,
  Globe,
  AlertTriangle,
  UserCheck,
  Search,
  RefreshCw,
  Radio,
  Network,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

export interface CaptivePortalViewProps {
  tenant: PortalTenantSettings;
  packages: PortalPackage[];
  slug?: string;
  onPay?: (
    packageId: string,
    phone: string,
    pppoeDetails?: { username?: string; customerId?: string },
  ) => void;
  onRedeemVoucher?: (code: string) => void;
  isPaymentPending?: boolean;
  isRedeemPending?: boolean;
  isWaitingForPin?: boolean;
  isPolling?: boolean;
  isTimedOut?: boolean;
  elapsedSeconds?: number;
  onRetryPolling?: () => void;
  onCancelPolling?: () => void;
  activeCode?: string | null;
  redeemedData?: {
    code: string;
    packageName: string;
    expiresAt: string | null;
  } | null;
  onReset?: () => void;
  previewMode?: boolean;
}

export function CaptivePortalView({
  tenant,
  packages,
  slug,
  onPay,
  onRedeemVoucher,
  isPaymentPending = false,
  isRedeemPending = false,
  isWaitingForPin = false,
  isPolling = false,
  isTimedOut = false,
  elapsedSeconds = 0,
  onRetryPolling,
  onCancelPolling,
  activeCode = null,
  redeemedData = null,
  onReset,
  previewMode = false,
}: CaptivePortalViewProps) {
  const fetchPPPoECustomer = useServerFn(lookupPPPoECustomer);

  const [activeTab, setActiveTab] = useState<"hotspot" | "pppoe">(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const tabParam = sp.get("tab") || sp.get("type") || sp.get("service");
      if (tabParam === "pppoe" || tabParam === "fiber") return "pppoe";
    }
    const hasHotspot = packages.some((p) => p.kind !== "pppoe");
    const hasPPPoE = packages.some((p) => p.kind === "pppoe");
    if (!hasHotspot && hasPPPoE) return "pppoe";
    return "hotspot";
  });

  const [pppoeQuery, setPppoeQuery] = useState("");
  const [isLookingUpPPPoE, setIsLookingUpPPPoE] = useState(false);
  const [pppoeCustomer, setPppoeCustomer] = useState<{
    id: string;
    fullName: string | null;
    username: string;
    phone: string | null;
    status: string;
    expiresAt: string | null;
    packageId: string | null;
    packageName: string | null;
    routerName: string | null;
  } | null>(null);
  const [pppoeNotFound, setPppoeNotFound] = useState(false);

  const [phone, setPhone] = useState("");
  const [selectedPkg, setSelectedPkg] = useState<PortalPackage | null>(() => {
    return packages && packages.length > 0 ? packages[0] : null;
  });
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [voucherInput, setVoucherInput] = useState("");

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // State to hold router redirect variables, initialized synchronously on creation
  const [redirectParams] = useState<{
    linkLoginOnly: string | null;
    linkLogin: string | null;
    linkOrig: string | null;
    mac: string | null;
    ip: string | null;
  }>(() => {
    if (typeof window === "undefined") {
      return {
        linkLoginOnly: null,
        linkLogin: null,
        linkOrig: null,
        mac: null,
        ip: null,
      };
    }
    const searchParams = new URLSearchParams(window.location.search);
    return {
      linkLoginOnly:
        searchParams.get("link-login-only") ||
        searchParams.get("linkLoginOnly") ||
        searchParams.get("linkloginonly") ||
        searchParams.get("link_login_only") ||
        null,
      linkLogin:
        searchParams.get("link-login") ||
        searchParams.get("linkLogin") ||
        searchParams.get("linklogin") ||
        searchParams.get("link_login") ||
        searchParams.get("login-url") ||
        searchParams.get("loginurl") ||
        null,
      linkOrig:
        searchParams.get("link-orig") ||
        searchParams.get("linkOrig") ||
        searchParams.get("linkorig") ||
        searchParams.get("link-dst") ||
        searchParams.get("dst") ||
        searchParams.get("target") ||
        null,
      mac:
        searchParams.get("mac") ||
        searchParams.get("mac-address") ||
        searchParams.get("client_mac") ||
        searchParams.get("username") ||
        null,
      ip:
        searchParams.get("ip") ||
        searchParams.get("client_ip") ||
        searchParams.get("uamip") ||
        null,
    };
  });

  const [autoConnectSeconds, setAutoConnectSeconds] = useState<number | null>(null);
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [autoConnectStatus, setAutoConnectStatus] = useState<string>("");

  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!redeemedData?.expiresAt) {
      setTimeRemaining("");
      setIsExpired(false);
      return;
    }

    const interval = setInterval(() => {
      const expiry = new Date(redeemedData.expiresAt!).getTime();
      const now = new Date().getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeRemaining("Expired");
        setIsExpired(true);
        clearInterval(interval);

        // Show a toast when it expires
        toast.error("Your internet session has expired.");
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      const hStr = h > 0 ? `${h}h ` : "";
      const mStr = m > 0 ? `${m}m ` : h > 0 ? "0m " : "";
      const sStr = `${s}s`;

      setTimeRemaining(`${hStr}${mStr}${sStr}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [redeemedData?.expiresAt]);

  // Keep selectedPkg in sync if packages load/change and none was selected yet
  useEffect(() => {
    if (packages && packages.length > 0 && !selectedPkg) {
      setSelectedPkg(packages[0]);
    }
  }, [packages, selectedPkg]);

  // Open and keep checkout modal open while waiting for PIN or polling is active
  useEffect(() => {
    if (isWaitingForPin || isPolling) {
      setCheckoutModalOpen(true);
    }
  }, [isWaitingForPin, isPolling]);

  // Automatically dismiss checkout modal once the payment succeeds and code is assigned
  useEffect(() => {
    if (activeCode || redeemedData) {
      setCheckoutModalOpen(false);
    }
  }, [activeCode, redeemedData]);

  const activeVoucherCode = activeCode || redeemedData?.code;

  const handleAutoConnect = useCallback(() => {
    if (!activeVoucherCode) return;

    // Safely determine the login URL, but strictly avoid .local domains due to mDNS resolution bugs on Android/Apple
    const loginUrl =
      redirectParams.linkLoginOnly ||
      redirectParams.linkLogin ||
      (redirectParams.ip ? `http://${redirectParams.ip.replace(/\.\d+$/, ".1")}/login` : null);

    // Candidates for common router IPs if not provided by redirect
    const candidates = [
      loginUrl,
      "http://10.10.0.1/login",
      "http://192.168.88.1/login",
      "http://1.1.1.1/login",
      "http://login.wifibilling.site/login",
    ].filter(Boolean) as string[];

    // Forcibly rewrite hotspot.local and hotspot.lan to the default IP to avoid name resolution failures
    const finalizedCandidates = candidates.map((url) =>
      url.replace("hotspot.local", "10.10.0.1").replace("hotspot.lan", "10.10.0.1"),
    );

    setAutoConnectAttempted(true);
    setAutoConnectStatus("Establishing Internet Access...");

    // Submit to ALL candidates (hidden forms)
    finalizedCandidates.forEach((url, index) => {
      setTimeout(() => {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = url;
        form.style.display = "none";

        const usernameInput = document.createElement("input");
        usernameInput.type = "hidden";
        usernameInput.name = "username";
        usernameInput.value = activeVoucherCode;
        form.appendChild(usernameInput);

        const passwordInput = document.createElement("input");
        passwordInput.type = "hidden";
        passwordInput.name = "password";
        passwordInput.value = activeVoucherCode;
        form.appendChild(passwordInput);

        if (redirectParams.linkOrig) {
          const dstInput = document.createElement("input");
          dstInput.type = "hidden";
          dstInput.name = "dst";
          dstInput.value = redirectParams.linkOrig;
          form.appendChild(dstInput);
        }

        document.body.appendChild(form);
        try {
          form.submit();
        } catch (e) {
          // Ignore failures for specific candidates
        }
      }, index * 200);
    });

    // After a short delay, show a redirecting status
    setTimeout(() => {
      if (mounted.current) {
        setAutoConnectStatus("Connected! Redirecting...");
        // If we have an original destination, try to go there after 3 seconds as a fallback
        if (redirectParams.linkOrig) {
          setTimeout(() => {
            if (mounted.current) {
              window.location.href = redirectParams.linkOrig!;
            }
          }, 3000);
        }
      }
    }, 2000);
  }, [activeVoucherCode, redirectParams]);

  useEffect(() => {
    if (activeVoucherCode && !autoConnectAttempted) {
      // Allow the router's 10s-15s scheduler time to pull the provisioning sync command
      // and perform a background `/ip hotspot active login` before we attempt fallback HTML POST
      setAutoConnectSeconds(15);
      setAutoConnectStatus("Payment confirmed! Connecting to internet...");
    }
  }, [activeVoucherCode, autoConnectAttempted]);

  useEffect(() => {
    if (autoConnectSeconds === null) return;
    if (autoConnectSeconds > 0) {
      const timer = setTimeout(() => {
        const next = autoConnectSeconds - 1;
        setAutoConnectSeconds(next);
        if (next === 12) {
          setAutoConnectStatus("Synchronizing with router...");
        } else if (next === 8) {
          setAutoConnectStatus("Provisioning internet access...");
        } else if (next === 4) {
          setAutoConnectStatus("Finalizing connection...");
        }

        // Active internet polling check
        const checkInternet = () => {
          const img = new Image();
          img.onload = () => {
            setAutoConnectStatus("Internet connected! Redirecting...");
            setTimeout(() => {
              window.location.href = redirectParams.linkOrig || "https://google.com";
            }, 500);
          };
          // Cache-busting URL to check internet access
          img.src = `https://www.google.com/favicon.ico?_t=${Date.now()}`;
        };
        
        // Ping every 2 seconds
        if (next % 2 === 0) {
          checkInternet();
        }
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      handleAutoConnect();
    }
  }, [autoConnectSeconds, handleAutoConnect, redirectParams.linkOrig]);

  const handlePackageClick = (pkg: PortalPackage) => {
    setSelectedPkg(pkg);
    setCheckoutModalOpen(true);
  };

  // Theme presets
  const theme = useMemo(() => {
    const preset = tenant.theme_preset || "midnight";
    switch (preset) {
      case "obsidian":
        return {
          bg: "bg-[#09090B]",
          cardBg: "bg-[#18181B]",
          innerBg: "bg-[#121215]",
          border: "border-zinc-800",
          textPrimary: "text-zinc-100",
          textSecondary: "text-zinc-400",
          textMuted: "text-zinc-500",
          packageCard: "bg-zinc-100 hover:bg-white text-zinc-900",
          pillBg: "bg-[#71717A]",
          pillText: "text-white",
          inputBg: "bg-[#121215] border-zinc-700 text-white placeholder:text-zinc-500",
        };
      case "sapphire":
        return {
          bg: "bg-[#030D1C]",
          cardBg: "bg-[#0A1C36]",
          innerBg: "bg-[#061426]",
          border: "border-blue-900/60",
          textPrimary: "text-blue-50",
          textSecondary: "text-blue-200/80",
          textMuted: "text-blue-300/60",
          packageCard: "bg-blue-50 hover:bg-white text-slate-900",
          pillBg: "bg-[#4B6B94]",
          pillText: "text-white",
          inputBg: "bg-[#061426] border-blue-900/80 text-white placeholder:text-blue-400/50",
        };
      case "light":
        return {
          bg: "bg-[#F4F6F9]",
          cardBg: "bg-[#FFFFFF]",
          innerBg: "bg-[#F8FAFC]",
          border: "border-slate-200",
          textPrimary: "text-slate-900",
          textSecondary: "text-slate-600",
          textMuted: "text-slate-400",
          packageCard: "bg-slate-100 hover:bg-slate-200/80 text-slate-900 border border-slate-200",
          pillBg: "bg-slate-300",
          pillText: "text-slate-800",
          inputBg: "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400",
        };
      case "midnight":
      default:
        return {
          bg: "bg-[#07101E]",
          cardBg: "bg-[#0D192E]",
          innerBg: "bg-[#081120]",
          border: "border-slate-800",
          textPrimary: "text-slate-100",
          textSecondary: "text-slate-300",
          textMuted: "text-slate-400",
          packageCard: "bg-slate-100 hover:bg-white text-slate-800",
          pillBg: "bg-[#8a99aa]",
          pillText: "text-orange-500",
          inputBg: "bg-[#081120] border-slate-700 text-white placeholder:text-slate-500",
        };
    }
  }, [tenant.theme_preset]);

  const accentColor = tenant.accent_color || "#f97316";
  const currency = getCurrencyByCountry(tenant.country);
  const titleText = tenant.portal_title || tenant.business_name || "Wi-Fi Hotspot";
  const isKenya = tenant.country === "Kenya";
  const providerName = isKenya ? "M-Pesa" : "Mobile Money";

  const subtitleText =
    tenant.portal_subtitle || `Select a package · Enter ${providerName} number · Complete payment`;
  const cardStyle = tenant.card_style || "pill";

  const handleLookupPPPoE = async () => {
    if (!pppoeQuery.trim()) {
      toast.error("Enter your PPPoE username or registered phone number");
      return;
    }
    const tenantSlug =
      slug ||
      (typeof window !== "undefined" ? window.location.pathname.split("/").pop() : "preview") ||
      "preview";
    setIsLookingUpPPPoE(true);
    setPppoeNotFound(false);
    try {
      const res = await fetchPPPoECustomer({
        data: { slug: tenantSlug, query: pppoeQuery.trim() },
      });
      if (res.found && res.customer) {
        setPppoeCustomer(res.customer);
        if (res.customer.phone && !phone) {
          setPhone(res.customer.phone);
        }
        // Auto-select their package if matches, or first PPPoE package
        const pppoePkgs = packages.filter((p) => p.kind === "pppoe");
        const matchingPkg = pppoePkgs.find(
          (p) =>
            p.id === res.customer?.packageId ||
            p.name.toLowerCase() === res.customer?.packageName?.toLowerCase(),
        );
        if (matchingPkg) {
          setSelectedPkg(matchingPkg);
        } else if (pppoePkgs.length > 0) {
          setSelectedPkg(pppoePkgs[0]);
        }
        toast.success(`Found subscriber account: ${res.customer.username}`);
      } else {
        setPppoeCustomer(null);
        setPppoeNotFound(true);
        toast.error("No subscriber found with that username or phone number.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setIsLookingUpPPPoE(false);
    }
  };

  const handlePayClick = () => {
    if (selectedPkg && onPay) {
      toast.info(
        `Connecting to payment gateway... Please check your phone for the ${providerName} PIN prompt.`,
      );
      if (activeTab === "pppoe" && pppoeCustomer) {
        onPay(selectedPkg.id, phone, {
          username: pppoeCustomer.username,
          customerId: pppoeCustomer.id,
        });
      } else {
        onPay(selectedPkg.id, phone);
      }
    }
  };

  const handleRedeemClick = () => {
    if (onRedeemVoucher && voucherInput.trim()) {
      onRedeemVoucher(voucherInput.trim());
    }
  };

  // Success / Active Access Screen
  if (activeCode || redeemedData) {
    const displayCode = activeCode || redeemedData?.code;
    return (
      <main
        className={`min-h-screen ${theme.bg} ${theme.textPrimary} flex flex-col justify-center py-8 px-6 transition-colors duration-300`}
        style={{ "--portal-accent": accentColor } as React.CSSProperties}
      >
        <div className="w-full max-w-sm mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-8"
          >
            <div className="flex justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.1 }}
                className="relative"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full animate-pulse"
                />
                <motion.div
                  initial={{ rotate: -45, scale: 0.5 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="relative bg-emerald-500 rounded-full p-5 shadow-2xl shadow-emerald-500/40"
                >
                  <CheckCircle2 className="size-14 text-white" />
                </motion.div>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-2"
            >
              <h1 className="text-3xl font-black tracking-tight text-white leading-tight">
                Payment Confirmed!
              </h1>
              <p className={`text-sm ${theme.textSecondary} font-medium`}>
                Your internet access is now active.
              </p>
            </motion.div>

            {/* High Impact Voucher Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="relative group"
            >
              {isExpired && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-sm rounded-3xl p-6 text-center space-y-4 border border-red-500/20"
                >
                  <div className="bg-red-500/20 p-3 rounded-full">
                    <AlertTriangle className="size-8 text-red-500 animate-bounce" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-black text-white">Session Expired</h2>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Your access time has reached its limit.
                    </p>
                  </div>
                  <Button
                    onClick={onReset}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all"
                  >
                    Buy New Plan
                  </Button>
                </motion.div>
              )}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
              <div
                className={`relative p-8 rounded-3xl bg-slate-950 border border-white/10 space-y-5 shadow-2xl overflow-hidden`}
              >
                <div className="absolute top-0 right-0 p-3">
                  <div className="size-2 rounded-full bg-emerald-500 animate-ping" />
                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400/80">
                  Your Access Code
                </p>

                <div className="flex items-center justify-center gap-4">
                  <span className="text-5xl font-mono font-black tracking-[0.1em] text-white tabular-nums drop-shadow-sm">
                    {displayCode}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-12 bg-white/5 hover:bg-white/10 text-emerald-400 border border-white/5 rounded-2xl transition-all"
                    onClick={() => {
                      if (displayCode) {
                        navigator.clipboard.writeText(displayCode);
                        toast.success("Code copied to clipboard");
                      }
                    }}
                  >
                    <Copy className="size-6" />
                  </Button>
                </div>

                <div className="pt-2 flex flex-col items-center gap-3">
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-widest`}
                  >
                    <ShieldCheck className="size-3" />
                    Verified Transaction
                  </div>

                  {timeRemaining && (
                    <div className="flex items-center gap-2 text-slate-300 font-mono text-sm bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                      <Clock className="size-4 text-emerald-400" />
                      <span className="font-bold">Remaining:</span>
                      <span className="text-emerald-400 tabular-nums">{timeRemaining}</span>
                    </div>
                  )}

                  {redeemedData?.packageName && (
                    <div className="text-[10px] font-medium text-slate-500 uppercase tracking-tight">
                      Plan: {redeemedData.packageName}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Auto Connect Engine UI */}
            {activeVoucherCode && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="space-y-5"
              >
                <div
                  className={`p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm space-y-4`}
                >
                  <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider">
                    <span className="text-slate-400">Connection Engine</span>
                    <span className="text-emerald-400 flex items-center gap-2">
                      <Zap className="size-3 fill-emerald-400" />
                      Auto-Connecting
                    </span>
                  </div>

                  {autoConnectSeconds !== null && autoConnectSeconds > 0 ? (
                    <div className="space-y-3 text-left">
                      <div className="flex items-center justify-between text-sm font-bold text-white">
                        <span className="animate-pulse">{autoConnectStatus}</span>
                        <span className="font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-xs">
                          {autoConnectSeconds}s
                        </span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000 ease-linear shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                          style={{ width: `${(autoConnectSeconds / 15) * 100}%` }}
                        />
                      </div>
                      {!redirectParams.linkLogin && !redirectParams.ip && (
                        <p className="text-[9px] text-amber-400 font-medium leading-tight">
                          Note: Automatic connection works best when connected directly to the
                          hotspot Wi-Fi.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-3 py-2 text-sm font-black text-white">
                      <Loader2 className="size-5 animate-spin text-emerald-400" />
                      <span className="tracking-tight">{autoConnectStatus || "Finalizing..."}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-7 rounded-2xl shadow-2xl shadow-emerald-600/30 transition-all active:scale-[0.97] border-0 text-lg group"
                    onClick={handleAutoConnect}
                  >
                    <Globe className="size-6 mr-3 group-hover:rotate-12 transition-transform" />
                    Connect Now
                  </Button>

                  {redirectParams.linkOrig && (
                    <Button
                      variant="outline"
                      className="w-full bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold py-6 rounded-2xl transition-all"
                      onClick={() => (window.location.href = redirectParams.linkOrig!)}
                    >
                      <ArrowRight className="size-5 mr-2" />
                      Continue to Website
                    </Button>
                  )}
                </div>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="pt-4"
            >
              <Button
                variant="ghost"
                className={`text-slate-500 hover:text-white font-bold text-xs uppercase tracking-widest`}
                onClick={onReset}
              >
                Return to Portal
              </Button>
            </motion.div>
          </motion.div>
        </div>

        <footer
          className={`fixed bottom-8 left-0 right-0 text-center text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]`}
        >
          Powered by {tenant.business_name}
        </footer>
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen ${theme.bg} ${theme.textPrimary} flex flex-col justify-between py-6 px-4 sm:px-6 transition-colors duration-300`}
      style={{ "--portal-accent": accentColor } as React.CSSProperties}
    >
      <div className="w-full max-w-sm mx-auto space-y-5">
        {/* Optional Announcement Banner */}
        {tenant.announcement_text && (
          <div
            className="rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-2 text-white shadow-md"
            style={{ backgroundColor: accentColor }}
          >
            <Sparkles className="size-4 shrink-0" />
            <span className="leading-snug">{tenant.announcement_text}</span>
          </div>
        )}

        {/* Dynamic Header Card */}
        <header
          className={`rounded-2xl ${theme.cardBg} border ${theme.border} p-5 text-center shadow-xl`}
        >
          {tenant.logo_url ? (
            <img
              src={tenant.logo_url}
              alt={`${tenant.business_name} logo`}
              className="mx-auto h-12 w-auto object-contain mb-2 max-w-[180px]"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          ) : null}

          <h1
            className="text-2xl sm:text-3xl font-black tracking-wider uppercase drop-shadow-sm"
            style={{ color: accentColor }}
          >
            {titleText}
          </h1>

          <p className={`text-xs ${theme.textSecondary} font-medium mt-1.5 leading-snug`}>
            {subtitleText}
          </p>

          {/* Customer Care Pill */}
          {tenant.support_phone && (
            <a
              href={`tel:${tenant.support_phone}`}
              className={`mt-3.5 inline-flex items-center justify-center gap-1.5 ${theme.innerBg} border ${theme.border} rounded-full px-4 py-1.5 text-xs ${theme.textSecondary} shadow-inner hover:scale-[1.02] transition-transform`}
            >
              <PhoneCall className="size-3" style={{ color: accentColor }} />
              <span>Customer Care:</span>
              <span className="font-bold text-white font-mono tracking-wide">
                {tenant.support_phone}
              </span>
            </a>
          )}
        </header>

        {/* Service Type Switcher Tabs */}
        {packages.some((p) => p.kind !== "pppoe") && packages.some((p) => p.kind === "pppoe") && (
          <div className="flex rounded-xl bg-black/20 p-1 border border-white/5">
            <button
              type="button"
              onClick={() => {
                setActiveTab("hotspot");
                const firstHotspot = packages.find((p) => p.kind !== "pppoe") || packages[0] || null;
                setSelectedPkg(firstHotspot);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "hotspot"
                  ? "bg-white text-slate-900 shadow-md"
                  : `${theme.textSecondary} hover:text-white`
              }`}
            >
              <Wifi className="size-3.5" />
              <span>Hotspot Wi-Fi</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("pppoe");
                const firstPPPoE = packages.find((p) => p.kind === "pppoe") || packages[0] || null;
                setSelectedPkg(firstPPPoE);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "pppoe"
                  ? "bg-white text-slate-900 shadow-md"
                  : `${theme.textSecondary} hover:text-white`
              }`}
            >
              <Network className="size-3.5" />
              <span>PPPoE Home Fiber</span>
            </button>
          </div>
        )}

        {activeTab === "hotspot" ? (
          <>
            {/* Dynamic Packages Grid */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2
                  className="font-black text-sm sm:text-base tracking-wide uppercase"
                  style={{ color: accentColor }}
                >
                  Hotspot Packages
                </h2>
                <span className={`text-[10px] font-bold ${theme.textMuted} uppercase`}>
                  {packages.filter((p) => p.kind !== "pppoe").length || packages.length}{" "}
                  {packages.length === 1 ? "Option" : "Options"}
                </span>
              </div>

              {(packages.filter((p) => p.kind !== "pppoe").length > 0
                ? packages.filter((p) => p.kind !== "pppoe")
                : packages
              ).length === 0 ? (
                <div
                  className={`rounded-2xl ${theme.cardBg} border border-dashed ${theme.border} p-6 text-center text-xs ${theme.textMuted}`}
                >
                  No active Wi-Fi packages currently available.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                  {(packages.filter((p) => p.kind !== "pppoe").length > 0
                    ? packages.filter((p) => p.kind !== "pppoe")
                    : packages
                  ).map((p) => {
                    const isSelected = selectedPkg?.id === p.id;

                    if (cardStyle === "modern") {
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handlePackageClick(p)}
                          className={`group rounded-xl p-2.5 flex flex-col items-center justify-between text-center min-h-[110px] transition-all duration-200 cursor-pointer relative overflow-hidden focus:outline-none ${
                            isSelected
                              ? "bg-white text-slate-900 shadow-lg scale-[1.03]"
                              : `${theme.cardBg} border ${theme.border} ${theme.textPrimary} hover:border-slate-500`
                          }`}
                          style={{
                            borderColor: isSelected ? accentColor : undefined,
                            borderWidth: isSelected ? "2px" : "1px",
                          }}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-tight line-clamp-1">
                            {formatPackageDuration(p.duration_hours)}
                          </span>
                          <span
                            className="text-base font-black tracking-tight my-1"
                            style={{ color: isSelected ? accentColor : undefined }}
                          >
                            {currency} {p.price_kes}
                          </span>
                          <span className="text-[8px] font-bold opacity-70 uppercase tracking-tighter">
                            {p.speed_down_mbps}M · UNLIMITED
                          </span>
                        </button>
                      );
                    }

                    if (cardStyle === "minimal") {
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handlePackageClick(p)}
                          className={`rounded-lg p-2 flex flex-col items-center justify-between text-center min-h-[100px] transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-white/10 shadow"
                              : `${theme.cardBg} ${theme.border} hover:bg-white/5`
                          }`}
                          style={{
                            borderColor: isSelected ? accentColor : undefined,
                            borderWidth: isSelected ? "2px" : "1px",
                          }}
                        >
                          <span className="text-[10px] font-semibold text-slate-200">
                            {formatPackageDuration(p.duration_hours)}
                          </span>
                          <span className="text-sm font-black" style={{ color: accentColor }}>
                            {currency} {p.price_kes}
                          </span>
                          <span className="text-[8px] text-slate-400">
                            {p.speed_down_mbps} Mbps
                          </span>
                        </button>
                      );
                    }

                    // Default "pill" badge style matching the screenshot design
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePackageClick(p)}
                        className={`group rounded-xl sm:rounded-2xl p-2 sm:p-2.5 flex flex-col items-center justify-between text-center min-h-[105px] sm:min-h-[115px] transition-all duration-200 cursor-pointer relative overflow-hidden focus:outline-none ${
                          isSelected
                            ? "bg-white ring-2 shadow-lg scale-[1.03]"
                            : `${theme.packageCard} shadow hover:shadow-md`
                        }`}
                        style={{
                          borderColor: isSelected ? accentColor : undefined,
                          boxShadow: isSelected ? `0 10px 25px -5px ${accentColor}40` : undefined,
                        }}
                      >
                        {/* Duration / Name Header */}
                        <span className="text-[10px] sm:text-[11px] font-extrabold text-slate-800 uppercase tracking-tight line-clamp-1 w-full text-center">
                          {formatPackageDuration(p.duration_hours)}
                        </span>

                        {/* Middle Grey Pill with Accent Price */}
                        <div
                          className={`w-full max-w-[85px] sm:max-w-[95px] my-1 rounded-md sm:rounded-lg ${theme.pillBg} py-1 px-1.5 text-center shadow-inner group-hover:brightness-95 transition-all`}
                        >
                          <span
                            className="font-black text-xs sm:text-sm tracking-tight block"
                            style={{ color: accentColor }}
                          >
                            {currency} {p.price_kes}
                          </span>
                        </div>

                        {/* Bottom Unlimited / Speed Tag */}
                        <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-tighter block w-full text-center">
                          {p.speed_down_mbps}M · UNLIMITED
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Full-Width Redeem Voucher Action */}
            <Button
              type="button"
              onClick={() => setVoucherModalOpen(true)}
              className="w-full text-white font-black h-12 sm:h-13 rounded-2xl shadow-xl flex items-center justify-center gap-2 text-sm sm:text-base transition active:scale-[0.98]"
              style={{
                backgroundColor: accentColor,
              }}
            >
              <Ticket className="size-5" />
              <span>Redeem Voucher</span>
            </Button>
          </>
        ) : (
          /* PPPoE Self-Service Renewal View */
          <div className="space-y-4">
            {/* Account Search Box */}
            <div className={`rounded-2xl ${theme.cardBg} border ${theme.border} p-4 space-y-3`}>
              <div className="flex items-center gap-2">
                <Search className="size-4" style={{ color: accentColor }} />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  Find PPPoE Account
                </h2>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLookupPPPoE();
                }}
                className="flex gap-2"
              >
                <Input
                  type="text"
                  placeholder="Username or Phone (e.g. user01)"
                  value={pppoeQuery}
                  onChange={(e) => setPppoeQuery(e.target.value)}
                  className={`${theme.inputBg} h-11 text-xs sm:text-sm rounded-xl flex-1`}
                />
                <Button
                  type="submit"
                  disabled={isLookingUpPPPoE || !pppoeQuery.trim()}
                  className="text-white font-bold h-11 px-4 rounded-xl text-xs"
                  style={{ backgroundColor: accentColor }}
                >
                  {isLookingUpPPPoE ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <span>Find</span>
                  )}
                </Button>
              </form>

              {pppoeNotFound && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 space-y-1">
                  <p className="font-semibold">Account not found.</p>
                  <p className="text-slate-400 text-[10px]">
                    Please double-check your PPPoE username or registered phone number.
                  </p>
                </div>
              )}
            </div>

            {/* Found Subscriber Details Card */}
            {pppoeCustomer && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl ${theme.cardBg} border ${theme.border} p-4 space-y-3 shadow-lg`}
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                  <div className="flex items-center gap-2">
                    <UserCheck className="size-4 text-emerald-400" />
                    <div>
                      <p className="text-xs font-black text-white">{pppoeCustomer.username}</p>
                      {pppoeCustomer.fullName && (
                        <p className="text-[10px] text-slate-400">{pppoeCustomer.fullName}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      pppoeCustomer.status === "active"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}
                  >
                    {pppoeCustomer.status === "active" ? "Active" : "Expired / Suspended"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-white/5 space-y-0.5">
                    <span className="text-slate-400 text-[9px] uppercase font-bold">
                      Current Plan
                    </span>
                    <p className="font-bold text-white truncate">
                      {pppoeCustomer.packageName || "Standard PPPoE"}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-white/5 space-y-0.5">
                    <span className="text-slate-400 text-[9px] uppercase font-bold">
                      Valid Until
                    </span>
                    <p className="font-bold text-white truncate">
                      {pppoeCustomer.expiresAt
                        ? new Date(pppoeCustomer.expiresAt).toLocaleDateString()
                        : "Expired"}
                    </p>
                  </div>
                </div>

                {/* PPPoE Packages Grid */}
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Choose Renewal Package
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(packages.filter((p) => p.kind === "pppoe").length > 0
                      ? packages.filter((p) => p.kind === "pppoe")
                      : packages
                    ).map((p) => {
                      const isSelected = selectedPkg?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPkg(p)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? "bg-white/10 border-white text-white shadow-md ring-1 ring-white/50"
                              : `${theme.innerBg} ${theme.border} text-slate-300 hover:border-slate-500`
                          }`}
                          style={{
                            borderColor: isSelected ? accentColor : undefined,
                          }}
                        >
                          <p className="text-[11px] font-bold truncate">{p.name}</p>
                          <p
                            className="text-sm font-black mt-0.5"
                            style={{ color: isSelected ? accentColor : undefined }}
                          >
                            {currency} {p.price_kes}
                          </p>
                          <p className="text-[9px] text-slate-400 uppercase font-semibold">
                            {formatPackageDuration(p.duration_hours)} · {p.speed_down_mbps}M
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pay Button for Found PPPoE Account */}
                <Button
                  type="button"
                  onClick={() => {
                    if (selectedPkg) {
                      setCheckoutModalOpen(true);
                    }
                  }}
                  className="w-full text-white font-black h-12 rounded-xl text-sm shadow-xl flex items-center justify-center gap-2 mt-2"
                  style={{ backgroundColor: accentColor }}
                >
                  <Zap className="size-4 fill-white" />
                  <span>
                    Renew {pppoeCustomer.username} · {currency} {selectedPkg?.price_kes || 0}
                  </span>
                </Button>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        className={`w-full max-w-sm mx-auto text-center text-[11px] ${theme.textMuted} font-medium pt-4`}
      >
        Powered by {tenant.business_name} · Secure M-Pesa billing
      </footer>

      {/* Interactive M-Pesa Checkout Dialog */}
      <Dialog
        open={checkoutModalOpen}
        onOpenChange={(open) => {
          if (!isPaymentPending && !isWaitingForPin) {
            setCheckoutModalOpen(open);
          }
        }}
      >
        <DialogContent
          className={`${theme.cardBg} ${theme.border} ${theme.textPrimary} max-w-sm sm:rounded-2xl p-5`}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white flex items-center gap-2">
              <Zap className="size-5 text-emerald-400 fill-emerald-400" />
              {providerName} Checkout
            </DialogTitle>
            <DialogDescription className={`text-xs ${theme.textMuted}`}>
              Authorize high-speed internet access instantly on your device.
            </DialogDescription>
          </DialogHeader>

          {selectedPkg && (
            <div className="space-y-4 py-2">
              {/* Selected Plan Details Panel */}
              <div
                className={`rounded-xl ${theme.innerBg} border ${theme.border} p-3.5 space-y-2 shadow-inner`}
              >
                <div className="flex justify-between items-center text-xs">
                  <span className={`${theme.textSecondary} font-semibold uppercase tracking-wider`}>
                    Selected Package
                  </span>
                  <span className="font-extrabold text-white">{selectedPkg.name}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className={`${theme.textSecondary} font-semibold uppercase tracking-wider`}>
                    Duration
                  </span>
                  <span className="font-extrabold text-white">
                    {formatPackageDuration(selectedPkg.duration_hours)}
                  </span>
                </div>
                <div
                  className="flex justify-between items-center text-xs border-t border-dashed pt-2 mt-1"
                  style={{ borderColor: accentColor + "20" }}
                >
                  <span className="font-black text-white text-sm">Amount Due</span>
                  <span className="font-black text-lg" style={{ color: accentColor }}>
                    {currency} {selectedPkg.price_kes}
                  </span>
                </div>
              </div>

              {/* Status or Input controls */}
              {!isWaitingForPin && !isPaymentPending ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (phone.trim().length >= 9) {
                      handlePayClick();
                    }
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="modalPhoneInput"
                      className={`text-xs font-semibold ${theme.textSecondary}`}
                    >
                      {providerName} Phone Number
                    </Label>
                    <Input
                      id="modalPhoneInput"
                      type="tel"
                      inputMode="tel"
                      placeholder="e.g. 0712345678 or 0112345678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={`${theme.inputBg} h-11 text-sm rounded-xl focus-visible:ring-1`}
                      autoFocus
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full text-white font-bold h-11 rounded-xl text-sm shadow-lg transition active:scale-[0.99]"
                    style={{
                      backgroundColor: accentColor,
                    }}
                    disabled={phone.trim().length < 9}
                  >
                    <Zap className="mr-2 h-4 w-4 fill-white" />
                    Pay {currency} {selectedPkg.price_kes} with {providerName}
                  </Button>
                </form>
              ) : isTimedOut ? (
                <div className="text-center py-4 space-y-4">
                  <div className="mx-auto size-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <AlertTriangle className="size-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-white">Payment Confirmation Pending</h3>
                    <p className={`text-xs ${theme.textSecondary} px-2 leading-relaxed`}>
                      We haven't received confirmation from {providerName} yet. If you already
                      entered your PIN, it may take a few extra moments.
                    </p>
                  </div>

                  <div className="space-y-2 pt-1">
                    <Button
                      type="button"
                      className="w-full text-white font-bold h-10 rounded-xl text-xs shadow-md"
                      style={{ backgroundColor: accentColor }}
                      onClick={onRetryPolling}
                    >
                      <Loader2 className="mr-2 h-3.5 w-3.5" />
                      Check Status Again
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full bg-white/5 border-white/10 hover:bg-white/10 text-white font-semibold h-10 rounded-xl text-xs"
                      onClick={() => {
                        setCheckoutModalOpen(false);
                        setVoucherModalOpen(true);
                      }}
                    >
                      <Ticket className="mr-2 h-3.5 w-3.5" />I have an M-Pesa Receipt Code
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className={`w-full text-xs ${theme.textMuted} hover:text-white h-8`}
                      onClick={() => {
                        if (onCancelPolling) onCancelPolling();
                        setCheckoutModalOpen(false);
                      }}
                    >
                      Cancel / Try Another Number
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 space-y-4">
                  <div className="relative flex items-center justify-center">
                    <Loader2 className="h-12 w-12 animate-spin" style={{ color: accentColor }} />
                    <Zap
                      className="absolute h-5 w-5 animate-pulse"
                      style={{ color: accentColor }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-white">
                      Waiting for {providerName} PIN...
                    </h3>
                    <p className={`text-xs ${theme.textSecondary} px-4 leading-relaxed`}>
                      Please check your phone for the {providerName} popup, enter your PIN, and
                      authorize your payment.
                    </p>
                  </div>

                  {/* 2-Second Live Polling Indicator */}
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-emerald-400">
                    <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Polling status every 2s</span>
                    {elapsedSeconds > 0 && (
                      <span className="text-slate-400 border-l border-white/10 pl-2">
                        {Math.floor(elapsedSeconds / 60)
                          .toString()
                          .padStart(2, "0")}
                        :{(elapsedSeconds % 60).toString().padStart(2, "0")}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Redeem Voucher Modal */}
      <Dialog open={voucherModalOpen} onOpenChange={setVoucherModalOpen}>
        <DialogContent
          className={`${theme.cardBg} ${theme.border} ${theme.textPrimary} max-w-sm sm:rounded-2xl p-5`}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white flex items-center gap-2">
              <Ticket className="size-5" style={{ color: accentColor }} />
              Redeem Wi-Fi Voucher
            </DialogTitle>
            <DialogDescription className={`text-xs ${theme.textMuted}`}>
              Enter the voucher code from your printed receipt or SMS to activate your access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="modalVoucherCode"
                className={`text-xs font-semibold ${theme.textSecondary}`}
              >
                Voucher Code
              </Label>
              <Input
                id="modalVoucherCode"
                placeholder="e.g. 984214 or VCH-1234"
                value={voucherInput}
                onChange={(e) => setVoucherInput(e.target.value)}
                className={`${theme.inputBg} font-mono tracking-widest text-center uppercase text-base h-11 rounded-xl`}
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button
              className="w-full text-white font-bold h-11 rounded-xl"
              style={{ backgroundColor: accentColor }}
              disabled={voucherInput.trim().length < 3 || isRedeemPending}
              onClick={handleRedeemClick}
            >
              {isRedeemPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Activate & Connect
            </Button>
            <Button
              variant="ghost"
              className={`w-full text-xs ${theme.textMuted} hover:text-white hover:bg-white/10 h-9`}
              onClick={() => setVoucherModalOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
