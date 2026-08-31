import { useState, useEffect, useMemo, useCallback } from "react";
import { PortalPackage, PortalTenantSettings } from "@/lib/portal.functions";
import { formatPackageDuration } from "@/lib/billing-helpers";
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
} from "lucide-react";
import { toast } from "sonner";

export interface CaptivePortalViewProps {
  tenant: PortalTenantSettings;
  packages: PortalPackage[];
  onPay?: (packageId: string, phone: string) => void;
  onRedeemVoucher?: (code: string) => void;
  isPaymentPending?: boolean;
  isRedeemPending?: boolean;
  isWaitingForPin?: boolean;
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
  onPay,
  onRedeemVoucher,
  isPaymentPending = false,
  isRedeemPending = false,
  isWaitingForPin = false,
  activeCode = null,
  redeemedData = null,
  onReset,
  previewMode = false,
}: CaptivePortalViewProps) {
  const [phone, setPhone] = useState("");
  const [selectedPkg, setSelectedPkg] = useState<PortalPackage | null>(null);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [voucherInput, setVoucherInput] = useState("");

  // State to hold router redirect variables
  const [redirectParams, setRedirectParams] = useState<{
    linkLoginOnly: string | null;
    linkLogin: string | null;
    linkOrig: string | null;
    mac: string | null;
    ip: string | null;
  }>({
    linkLoginOnly: null,
    linkLogin: null,
    linkOrig: null,
    mac: null,
    ip: null,
  });

  const [autoConnectSeconds, setAutoConnectSeconds] = useState<number | null>(null);
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [autoConnectStatus, setAutoConnectStatus] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      setRedirectParams({
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
      });
    }
  }, []);

  // Pre-select first available package by default without opening checkout modal
  useEffect(() => {
    if (packages.length > 0 && !selectedPkg) {
      setSelectedPkg(packages[0]);
    }
  }, [packages, selectedPkg]);

  // Automatically dismiss checkout modal once the payment succeeds and activeCode is assigned
  useEffect(() => {
    if (activeCode) {
      setCheckoutModalOpen(false);
    }
  }, [activeCode]);

  const activeVoucherCode = activeCode || redeemedData?.code;

  const handleAutoConnect = useCallback(() => {
    if (!activeVoucherCode) return;
    const loginUrl =
      redirectParams.linkLoginOnly ||
      redirectParams.linkLogin ||
      (redirectParams.ip
        ? `http://${redirectParams.ip.replace(/\.\d+$/, ".1")}/login`
        : "http://10.5.50.1/login");

    setAutoConnectAttempted(true);
    setAutoConnectStatus("Connecting to Wi-Fi...");

    const form = document.createElement("form");
    form.method = "POST";
    form.action = loginUrl;
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
    form.submit();
  }, [activeVoucherCode, redirectParams]);

  useEffect(() => {
    if (activeVoucherCode && !autoConnectAttempted) {
      // 5 seconds of buffer gives the router agent time to synchronize credentials
      setAutoConnectSeconds(5);
      setAutoConnectStatus("Connecting to MikroTik Hotspot...");
    }
  }, [activeVoucherCode, autoConnectAttempted]);

  useEffect(() => {
    if (autoConnectSeconds === null) return;
    if (autoConnectSeconds > 0) {
      const timer = setTimeout(() => {
        const next = autoConnectSeconds - 1;
        setAutoConnectSeconds(next);
        if (next === 4) {
          setAutoConnectStatus("Verifying M-Pesa transaction...");
        } else if (next === 2) {
          setAutoConnectStatus("Synchronizing access with router...");
        } else if (next === 1) {
          setAutoConnectStatus("Establishing internet session...");
        }
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      handleAutoConnect();
    }
  }, [autoConnectSeconds, handleAutoConnect]);

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
  const titleText = tenant.portal_title || tenant.business_name || "Wi-Fi Hotspot";
  const subtitleText =
    tenant.portal_subtitle || "Select a package · Enter M-Pesa number · Complete payment";
  const cardStyle = tenant.card_style || "pill";

  const handlePayClick = () => {
    if (selectedPkg && onPay) {
      toast.info(
        "Connecting to Safaricom Daraja... Please check your phone for the M-Pesa PIN prompt.",
      );
      onPay(selectedPkg.id, phone);
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
        className={`min-h-screen ${theme.bg} ${theme.textPrimary} flex flex-col justify-between py-8 px-4 sm:px-6 transition-colors duration-300`}
        style={{ "--portal-accent": accentColor } as React.CSSProperties}
      >
        <div className="w-full max-w-sm mx-auto space-y-5">
          <div
            className={`rounded-2xl ${theme.cardBg} border ${theme.border} p-6 text-center shadow-2xl space-y-4`}
          >
            <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <div>
              <h1 className="text-2xl font-black text-white">Connected & Active!</h1>
              <p className={`text-xs ${theme.textSecondary} mt-1`}>
                Use your access code below to log in to{" "}
                <span className="font-semibold" style={{ color: accentColor }}>
                  {tenant.business_name}
                </span>{" "}
                Wi-Fi.
              </p>
            </div>

            <div
              className={`rounded-xl ${theme.innerBg} border ${theme.border} p-4 space-y-2 shadow-inner`}
            >
              <span
                className={`text-[11px] font-semibold tracking-wider ${theme.textMuted} uppercase`}
              >
                Your Wi-Fi Access Code
              </span>
              <div className="flex items-center justify-center gap-2">
                <span
                  className="font-mono text-3xl font-black tracking-[0.25em]"
                  style={{ color: accentColor }}
                >
                  {displayCode}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-slate-400 hover:text-white hover:bg-white/10"
                  onClick={() => {
                    if (displayCode) {
                      navigator.clipboard.writeText(displayCode);
                      toast.success("Access code copied!");
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {redeemedData?.expiresAt && (
              <p
                className={`text-xs ${theme.textSecondary} flex items-center justify-center gap-1.5`}
              >
                <Clock className="size-3.5" style={{ color: accentColor }} />
                Valid until:{" "}
                {new Date(redeemedData.expiresAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}

            {/* Auto Connect Status Box */}
            {activeVoucherCode && (
              <div
                className={`rounded-xl ${theme.innerBg} border ${theme.border} p-4 space-y-3 shadow-inner text-left`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className={theme.textSecondary}>Router Authorization</span>
                  <span className="text-emerald-400 flex items-center gap-1.5 font-bold">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    Auto-Connecting
                  </span>
                </div>

                {autoConnectSeconds !== null && autoConnectSeconds > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span className="truncate max-w-[190px]">{autoConnectStatus}</span>
                      <span>{autoConnectSeconds}s</span>
                    </div>
                    {/* Animated Progress Bar */}
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 bg-emerald-500 transition-all duration-1000 ease-linear"
                        style={{ width: `${(autoConnectSeconds / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-400 py-1">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{autoConnectStatus || "Connecting device..."}</span>
                    </div>
                  </div>
                )}

                <Button
                  size="sm"
                  className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white h-9 rounded-lg border-0 cursor-pointer shadow-md"
                  onClick={handleAutoConnect}
                >
                  <Zap className="size-3.5 mr-1.5" /> Authorize & Connect Instantly
                </Button>
              </div>
            )}

            <Button
              className="w-full text-white font-bold h-11 rounded-xl shadow-lg transition active:scale-[0.99]"
              style={{
                backgroundColor: accentColor,
              }}
              onClick={onReset}
            >
              Back to Portal
            </Button>
          </div>
        </div>

        <footer className={`text-center text-xs ${theme.textMuted} pt-4`}>
          Powered by {tenant.business_name} · Secure M-Pesa billing
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

        {/* Dynamic Packages Grid */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2
              className="font-black text-sm sm:text-base tracking-wide uppercase"
              style={{ color: accentColor }}
            >
              Our Packages
            </h2>
            <span className={`text-[10px] font-bold ${theme.textMuted} uppercase`}>
              {packages.length} {packages.length === 1 ? "Option" : "Options"}
            </span>
          </div>

          {packages.length === 0 ? (
            <div
              className={`rounded-2xl ${theme.cardBg} border border-dashed ${theme.border} p-6 text-center text-xs ${theme.textMuted}`}
            >
              No active Wi-Fi packages currently available.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              {packages.map((p) => {
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
                        KES {p.price_kes}
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
                        KES {p.price_kes}
                      </span>
                      <span className="text-[8px] text-slate-400">{p.speed_down_mbps} Mbps</span>
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
                        Kes. {p.price_kes}
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
              M-Pesa Checkout
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
                    KES {selectedPkg.price_kes}
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
                      M-Pesa Phone Number
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
                    Pay KES {selectedPkg.price_kes} with M-Pesa
                  </Button>
                </form>
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
                    <h3 className="text-sm font-bold text-white">Sending STK Push Prompt...</h3>
                    <p className={`text-xs ${theme.textSecondary} px-4 leading-relaxed`}>
                      Please check your phone for the Safaricom M-Pesa popup, enter your M-Pesa PIN,
                      and authorize your payment.
                    </p>
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
