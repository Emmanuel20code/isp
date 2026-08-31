export type SubscriptionStatus = "trialing" | "active" | "expired" | "suspended" | "cancelled";

export type TenantBillingSnapshot = {
  subscription_status: SubscriptionStatus;
  trial_end_at: string;
  subscription_end_at: string | null;
};

export type BillingState = {
  /** Whether the tenant may operate the platform right now. */
  isEntitled: boolean;
  isTrial: boolean;
  /** Effective end of the current access window (trial or paid). */
  endsAt: Date | null;
  daysRemaining: number;
  /** Show the "expires in N days" banner. */
  showWarning: boolean;
  label: string;
};

const MS_PER_DAY = 86_400_000;

/**
 * Single source of truth for whether a tenant can use the platform.
 * Derived purely from stored timestamps — never from a manually flipped flag.
 */
export function computeBillingState(
  tenant: TenantBillingSnapshot,
  warningDays = 5,
  now: Date = new Date(),
): BillingState {
  const paidEnd = tenant.subscription_end_at ? new Date(tenant.subscription_end_at) : null;
  const trialEnd = tenant.trial_end_at ? new Date(tenant.trial_end_at) : null;

  const isSuspended =
    tenant.subscription_status === "suspended" || tenant.subscription_status === "cancelled";

  // Paid active if end date is in the future and not suspended
  const paidActive = !isSuspended && paidEnd !== null && paidEnd.getTime() > now.getTime();

  // Trial active if trial end date is in the future and status is trialing (and not paidActive)
  const trialActive =
    !isSuspended &&
    !paidActive &&
    tenant.subscription_status === "trialing" &&
    trialEnd !== null &&
    trialEnd.getTime() > now.getTime();

  // Explicit active if status is active (even if paidEnd is missing or pending timestamp write)
  const explicitActive =
    !isSuspended && !paidActive && !trialActive && tenant.subscription_status === "active";

  const isEntitled = paidActive || trialActive || explicitActive;
  const endsAt = paidActive
    ? paidEnd
    : trialActive
      ? trialEnd
      : (paidEnd ?? trialEnd ?? new Date(now.getTime() + 30 * 86_400_000));

  const msLeft = endsAt ? endsAt.getTime() - now.getTime() : 0;
  const daysRemaining = Math.max(0, Math.ceil(msLeft / MS_PER_DAY));

  return {
    isEntitled,
    isTrial: trialActive,
    endsAt,
    daysRemaining,
    showWarning: isEntitled && daysRemaining <= warningDays,
    label: !isEntitled
      ? tenant.subscription_status === "suspended"
        ? "Suspended"
        : "Expired"
      : trialActive
        ? `Trial · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`
        : `Active · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`,
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
