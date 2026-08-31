import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { startSubscriptionPayment, getPaymentStatus } from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Smartphone, CheckCircle2 } from "lucide-react";

type Props = {
  price: number;
  defaultPhone?: string | null | undefined;
  children: React.ReactNode;
};

export function RenewDialog({ price, defaultPhone, children }: Props) {
  const start = useServerFn(startSubscriptionPayment);
  const status = useServerFn(getPaymentStatus);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [pending, setPending] = useState(false);
  const [waiting, setWaiting] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  async function invalidateAppQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["my-context"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["subscription-history"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["tenants"] }),
    ]);
  }

  function watch(checkoutRequestId: string) {
    let ticks = 0;
    timer.current = setInterval(async () => {
      ticks += 1;
      try {
        const row = await status({ data: { checkoutRequestId } });
        if (row.status === "success") {
          if (timer.current) clearInterval(timer.current);
          setWaiting(null);
          toast.success(
            `Payment confirmed! Subscription successfully activated.${row.mpesa_receipt ? ` Receipt: ${row.mpesa_receipt}` : ""}`,
          );
          await invalidateAppQueries();
          setOpen(false);
        } else if (row.status === "failed" || row.status === "cancelled") {
          if (timer.current) clearInterval(timer.current);
          setWaiting(null);
          toast.error(row.failure_reason ?? "Payment was cancelled or failed");
        } else if (ticks > 35) {
          if (timer.current) clearInterval(timer.current);
          setWaiting(null);
          toast.info(
            "Waiting for Safaricom network confirmation. You can also sync database status anytime.",
          );
        }
      } catch (err) {
        // Suppress temporary network error during poll so interval keeps retrying
      }
    }, 3000);
  }

  async function pay() {
    setPending(true);
    try {
      const res = await start({ data: { phone } });
      setWaiting(res.checkoutRequestId);
      toast.success(res.message || "STK Push sent! Please enter your M-Pesa PIN on your phone.");
      watch(res.checkoutRequestId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not initiate M-Pesa payment");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-primary" /> Renew SaaS Subscription
          </DialogTitle>
          <DialogDescription>
            KES {price.toLocaleString()} for 30 days full platform access. We&apos;ll send an M-Pesa
            STK Push prompt directly to your phone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="mpesa-phone">Safaricom Phone Number</Label>
            <Input
              id="mpesa-phone"
              inputMode="tel"
              placeholder="07XX XXX XXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={Boolean(waiting) || pending}
            />
          </div>

          {waiting && (
            <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground animate-pulse">
              <Loader2 className="size-4 animate-spin text-primary shrink-0" />
              <span>
                STK Push sent to <strong>{phone}</strong>. Please check your phone and enter your
                M-Pesa PIN…
              </span>
            </div>
          )}

          <Button
            onClick={pay}
            disabled={pending || Boolean(waiting) || phone.trim().length < 9}
            className="w-full gap-2 font-bold"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Smartphone className="size-4" />
            )}
            Pay KES {price.toLocaleString()} via STK Push
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
