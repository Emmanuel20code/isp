import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extracts the client IP address from request headers.
 * Prioritizes X-Forwarded-For (standard for proxies like Cloud Run/Nginx)
 * then falls back to X-Real-IP or common Cloud provider headers.
 */
export function getClientIp(request: Request): string | null {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    // X-Forwarded-For can be a comma-separated list; the first one is the original client.
    const ips = xForwardedFor.split(",");
    return ips[0].trim();
  }

  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") || // Cloudflare
    request.headers.get("true-client-ip") ||
    null
  );
}
