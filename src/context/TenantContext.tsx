import React, { createContext, useContext, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyContext } from "@/lib/tenancy.functions";

interface TenantContextType {
  data: Awaited<ReturnType<typeof getMyContext>> | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  tenant: Awaited<ReturnType<typeof getMyContext>>["tenant"] | null;
  isSuperAdmin: boolean;
  country: string;
  selectedPaymentProvider: string | null;
  setSelectedPaymentProvider: (providerId: string | null) => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const fetchContext = useServerFn(getMyContext);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["my-context"],
    queryFn: () => fetchContext(),
    staleTime: 30000,
  });

  const [selectedPaymentProvider, setSelectedPaymentProvider] = useState<string | null>(null);

  const tenant = data?.tenant ?? null;
  const isSuperAdmin = data?.isSuperAdmin ?? false;
  const country = tenant?.country || "Kenya";

  return (
    <TenantContext.Provider
      value={{
        data,
        isLoading,
        error,
        refetch,
        tenant,
        isSuperAdmin,
        country,
        selectedPaymentProvider,
        setSelectedPaymentProvider,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}
