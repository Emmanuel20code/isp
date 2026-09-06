import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PaymentStatus {
  status: "pending" | "success" | "failed" | "cancelled" | "timeout";
  code?: string | null;
  expiresAt?: string | null;
  packageName?: string | null;
  receipt?: string | null;
  failureReason?: string | null;
  isAuthorized?: boolean;
}

export interface UsePaymentStatusOptions {
  intervalMs?: number; // default 2000 (2 seconds)
  timeoutSeconds?: number; // default 90 seconds
}

/**
 * usePaymentStatus Hook
 *
 * Automatically polls the backend every 2 seconds after an M-Pesa STK push
 * until Daraja / database confirms payment success and router authorization,
 * or until a reasonable timeout is reached.
 */
export function usePaymentStatus(
  checkoutId: string | null,
  onPoll?: (checkoutId: string) => Promise<PaymentStatus>,
  options?: UsePaymentStatusOptions,
) {
  const intervalMs = options?.intervalMs ?? 2000;
  const timeoutSeconds = options?.timeoutSeconds ?? 90;

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [isInternetGranted, setIsInternetGranted] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [pollTrigger, setPollTrigger] = useState(0);

  const isResolvedRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);

  const retryPolling = useCallback(() => {
    setIsTimedOut(false);
    setElapsedSeconds(0);
    isResolvedRef.current = false;
    startTimeRef.current = Date.now();
    setPaymentStatus({ status: "pending" });
    setPollTrigger((prev) => prev + 1);
  }, []);

  const cancelPolling = useCallback(() => {
    isResolvedRef.current = true;
    setIsPolling(false);
  }, []);

  useEffect(() => {
    if (!checkoutId) {
      setPaymentStatus(null);
      setIsInternetGranted(false);
      setIsPolling(false);
      setIsTimedOut(false);
      setElapsedSeconds(0);
      isResolvedRef.current = false;
      startTimeRef.current = null;
      return;
    }

    isResolvedRef.current = false;
    setIsPolling(true);
    setIsTimedOut(false);
    setElapsedSeconds(0);
    startTimeRef.current = Date.now();

    console.log(`[usePaymentStatus] Polling every ${intervalMs}ms for checkout ID: ${checkoutId}`);

    const handleSuccess = async (
      voucherId?: string | null,
      code?: string | null,
      packageName?: string | null,
      expiresAt?: string | null,
      receipt?: string | null,
    ) => {
      if (isResolvedRef.current) return;
      isResolvedRef.current = true;
      setIsPolling(false);
      setIsTimedOut(false);

      if (voucherId && !code) {
        // Fetch details if we only have the ID
        const { data: voucher } = await supabase
          .from("vouchers")
          .select("code, expires_at, packages(name)")
          .eq("id", voucherId)
          .maybeSingle();

        if (voucher) {
          const pkgName = Array.isArray(voucher.packages)
            ? (voucher.packages[0] as { name: string })?.name
            : (voucher.packages as { name: string } | null)?.name;

          setPaymentStatus({
            status: "success",
            code: voucher.code,
            expiresAt: voucher.expires_at,
            packageName: pkgName || "Active Plan",
            receipt,
            isAuthorized: true,
          });
        } else {
          setPaymentStatus({
            status: "success",
            code,
            expiresAt,
            packageName: packageName || "Active Plan",
            receipt,
            isAuthorized: true,
          });
        }
      } else {
        setPaymentStatus({
          status: "success",
          code,
          expiresAt,
          packageName: packageName || "Active Plan",
          receipt,
          isAuthorized: true,
        });
      }
      setIsInternetGranted(true);
      toast.success("Payment successful! Internet access authorized.");
    };

    const checkStatus = async (): Promise<boolean> => {
      if (isResolvedRef.current) return true;

      const elapsed = startTimeRef.current
        ? Math.floor((Date.now() - startTimeRef.current) / 1000)
        : 0;
      setElapsedSeconds(elapsed);

      // Timeout check
      if (elapsed >= timeoutSeconds) {
        console.warn(`[usePaymentStatus] Polling timed out after ${elapsed}s for ${checkoutId}`);
        isResolvedRef.current = true;
        setIsPolling(false);
        setIsTimedOut(true);
        setPaymentStatus({
          status: "timeout",
          failureReason:
            "Payment confirmation is taking longer than expected. Please check your phone or retry.",
        });
        return true; // Stop polling
      }

      if (onPoll) {
        try {
          const res = await onPoll(checkoutId);
          if (res.status === "success") {
            handleSuccess(undefined, res.code, res.packageName, res.expiresAt, res.receipt);
            return true;
          } else if (res.status === "failed" || res.status === "cancelled") {
            isResolvedRef.current = true;
            setIsPolling(false);
            setPaymentStatus({ status: res.status, failureReason: res.failureReason });
            toast.error(res.failureReason || "Payment was not completed. Please try again.");
            return true;
          }
          return false;
        } catch (err) {
          console.error("[usePaymentStatus] Error during onPoll query:", err);
        }
      }

      // Default DB fallback if onPoll is not provided or throws
      try {
        const { data, error } = await supabase
          .from("transactions")
          .select("status, voucher_id, mpesa_receipt, failure_reason")
          .eq("checkout_request_id", checkoutId)
          .maybeSingle();

        if (!error && data) {
          if (data.status === "success" && data.voucher_id) {
            handleSuccess(data.voucher_id, undefined, undefined, undefined, data.mpesa_receipt);
            return true; // Stop polling
          } else if (data.status === "failed") {
            isResolvedRef.current = true;
            setIsPolling(false);
            setPaymentStatus({
              status: "failed",
              failureReason: data.failure_reason || "Payment failed. Please try again.",
            });
            toast.error(data.failure_reason || "Payment failed. Please try again.");
            return true; // Stop polling
          }
        }
      } catch (dbErr) {
        console.error("[usePaymentStatus] Error fetching status from DB:", dbErr);
      }

      return false;
    };

    // Initial check immediately
    checkStatus();

    // Polling every 2 seconds
    const interval = setInterval(async () => {
      const stop = await checkStatus();
      if (stop) clearInterval(interval);
    }, intervalMs);

    // Backup Real-time subscription (works when WebSocket is not blocked)
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`payment-status-${checkoutId}-${pollTrigger}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "transactions",
            filter: `checkout_request_id=eq.${checkoutId}`,
          },
          async (payload) => {
            console.log("[usePaymentStatus] Real-time update received:", payload);
            const newStatus = payload.new.status;
            const voucherId = payload.new.voucher_id;
            const receipt = payload.new.mpesa_receipt;

            if (newStatus === "success" && voucherId) {
              await handleSuccess(voucherId, undefined, undefined, undefined, receipt);
            } else if (newStatus === "failed") {
              isResolvedRef.current = true;
              setIsPolling(false);
              setPaymentStatus({
                status: "failed",
                failureReason: payload.new.failure_reason || "Payment failed",
              });
              toast.error(payload.new.failure_reason || "Payment failed. Please try again.");
            }
          },
        )
        .subscribe();
    } catch (wsErr) {
      console.warn("[usePaymentStatus] Real-time channel skipped in walled garden:", wsErr);
    }

    return () => {
      clearInterval(interval);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [checkoutId, pollTrigger, intervalMs, timeoutSeconds]);

  return {
    paymentStatus,
    isInternetGranted,
    isPolling,
    elapsedSeconds,
    isTimedOut,
    retryPolling,
    cancelPolling,
  };
}
