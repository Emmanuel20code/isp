import { useQuery } from "@tanstack/react-query";
import { getDailyIncomeMetrics } from "@/lib/dashboard.functions";

export function useDailyIncome(days: number = 7, refetchInterval: number = 60000) {
  return useQuery({
    queryKey: ["daily-income", days],
    queryFn: () => getDailyIncomeMetrics({ data: { days } }),
    refetchInterval, // Optional auto-refetch, defaults to 60s
  });
}
