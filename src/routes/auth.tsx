import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Wifi, Loader2, ArrowLeft, KeyRound, Mail, CheckCircle2 } from "lucide-react";
import { registerAccountFn } from "@/lib/tenancy.functions";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "reset", "update-password"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Authentication · Wifi Billing Wi-Fi Billing" },
      {
        name: "description",
        content:
          "Sign in, create an account, or reset your password to manage Wi-Fi billing and M-Pesa payments.",
      },
      { property: "og:title", content: "Authentication · Wifi Billing Wi-Fi Billing" },
      { property: "og:description", content: "Access your Wifi Billing ISP dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function safePath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "update-password">(
    search.mode ?? "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const next = safePath(search.redirect);

  useEffect(() => {
    // Listen for password recovery events from Supabase Auth email links
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update-password");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session && mode !== "update-password") {
        navigate({ to: next, replace: true });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, next, mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();

    try {
      if (mode === "reset") {
        if (!cleanEmail) {
          toast.error("Please enter your email address");
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/auth?mode=update-password`,
        });

        if (error) throw error;
        setResetSent(true);
        toast.success("Password reset link sent! Check your inbox.");
      } else if (mode === "update-password") {
        if (password.length < 8) {
          toast.error("Password must be at least 8 characters");
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          toast.error("Passwords do not match");
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.updateUser({
          password,
        });

        if (error) throw error;
        toast.success("Password updated successfully! Redirecting...");
        navigate({ to: next, replace: true });
      } else if (mode === "signup") {
        try {
          await registerAccountFn({
            data: {
              email: cleanEmail,
              password,
              fullName: cleanName,
              phone: cleanPhone,
            },
          });
        } catch (serverErr) {
          const sMsg = serverErr instanceof Error ? serverErr.message : String(serverErr);
          if (sMsg.includes("already exists")) {
            toast.error("This email is already registered. Please sign in.", { duration: 6000 });
            setMode("signin");
            setLoading(false);
            return;
          }
          // Fallback to client signUp if server function returns unexpected error
          const { data: fbData, error: fbError } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: { full_name: cleanName, phone: cleanPhone },
            },
          });
          if (fbError) throw fbError;
          if (fbData.user && (!fbData.user.identities || fbData.user.identities.length === 0)) {
            toast.error("This email is already registered. Please sign in.", { duration: 6000 });
            setMode("signin");
            setLoading(false);
            return;
          }
        }

        // Authenticate the session
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) {
          if (signInError.message.includes("Email not confirmed")) {
            toast.info("Account created! Please check your email to confirm your account.", {
              duration: 6000,
            });
            setMode("signin");
            setLoading(false);
            return;
          }
          throw signInError;
        }

        toast.success("Account created successfully!");
        navigate({ to: next, replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        navigate({ to: next, replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.toLowerCase().includes("database error finding user") ||
        msg.toLowerCase().includes("database error") ||
        msg.toLowerCase().includes("invalid login credentials")
      ) {
        if (mode === "signin") {
          toast.error(
            "Account not found or password incorrect. If you're new, click 'Create an account' below.",
            {
              duration: 8000,
              action: {
                label: "Create Account",
                onClick: () => setMode("signup"),
              },
            },
          );
        } else {
          toast.error(msg || "Authentication failed. Please try again.");
        }
      } else {
        toast.error(msg || "Authentication failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}${next}`;
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectUrl,
      });

      if (result.error) {
        console.warn(
          "[Google Auth] Lovable auth error, trying Supabase OAuth direct fallback:",
          result.error,
        );
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: redirectUrl,
          },
        });
        if (error) throw error;
        return;
      }

      if (result.redirected) return;
      navigate({ to: next, replace: true });
    } catch (err) {
      const rawMessage =
        err && typeof err === "object" && "message" in err ? String(err.message) : String(err);

      if (
        rawMessage.includes("missing OAuth secret") ||
        rawMessage.includes("Unsupported provider") ||
        rawMessage.includes("validation_failed")
      ) {
        toast.error(
          "Google Auth requires configuration: Add your Google OAuth Client ID & Secret in your Supabase Auth Provider settings.",
          { duration: 7000 },
        );
      } else {
        toast.error(rawMessage || "Google sign-in failed");
      }
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-5 py-12"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 flex items-center justify-center gap-2 font-display text-xl font-bold"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Wifi className="size-4" />
          </span>
          Wifi Billing
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>
              {mode === "signup"
                ? "Create your ISP account"
                : mode === "reset"
                  ? "Reset your password"
                  : mode === "update-password"
                    ? "Set new password"
                    : "Welcome back"}
            </CardTitle>
            <CardDescription>
              {mode === "signup"
                ? "Start a 3-day free trial. No card required."
                : mode === "reset"
                  ? "Enter your email and we'll send you a password recovery link."
                  : mode === "update-password"
                    ? "Choose a strong password with at least 8 characters."
                    : "Sign in to manage your Wi-Fi billing."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(mode === "signin" || mode === "signup") && (
              <>
                <Button
                  variant="outline"
                  className="w-full gap-2.5 font-medium"
                  onClick={handleGoogle}
                  disabled={loading}
                >
                  <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  {loading ? "Connecting to Google..." : "Continue with Google"}
                </Button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> or{" "}
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            {mode === "reset" && resetSent ? (
              <div className="space-y-4 text-center py-3">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 className="size-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Check your email</p>
                  <p className="text-xs text-muted-foreground">
                    We sent a password reset link to{" "}
                    <strong className="text-foreground">{email}</strong>.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => {
                    setResetSent(false);
                    setMode("signin");
                  }}
                >
                  <ArrowLeft className="size-4" /> Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "signup" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Your name</Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. John Doe"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone (M-Pesa)</Label>
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="07XX XXX XXX"
                        required
                      />
                    </div>
                  </>
                )}

                {mode !== "update-password" && (
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                )}

                {mode === "signin" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => {
                          setResetSent(false);
                          setMode("reset");
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                )}

                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                    />
                  </div>
                )}

                {mode === "update-password" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        required
                      />
                    </div>
                  </>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {mode === "signup"
                    ? "Create account"
                    : mode === "reset"
                      ? "Send reset link"
                      : mode === "update-password"
                        ? "Update password"
                        : "Sign in"}
                </Button>
              </form>
            )}

            {mode === "reset" && !resetSent && (
              <p className="text-center text-sm text-muted-foreground">
                Remember your password?{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </p>
            )}

            {mode === "signin" && (
              <p className="text-center text-sm text-muted-foreground">
                New here?{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline font-semibold"
                  onClick={() => setMode("signup")}
                >
                  Create an account
                </button>
              </p>
            )}

            {mode === "signup" && (
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-primary hover:underline font-semibold"
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
