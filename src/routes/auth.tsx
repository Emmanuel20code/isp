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
import { Wifi, Loader2, ArrowLeft, KeyRound, Mail, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { registerAccountFn } from "@/lib/tenancy.functions";
import { ThemeToggle } from "@/components/ThemeToggle";

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
        let registrationSuccessful = false;
        let isExisting = false;
        try {
          const res = await registerAccountFn({
            data: {
              email: cleanEmail,
              password,
              fullName: cleanName,
              phone: cleanPhone,
            },
          });
          registrationSuccessful = true;
          isExisting = Boolean(res?.isExistingUser);
        } catch (serverErr) {
          const sMsg = serverErr instanceof Error ? serverErr.message : String(serverErr);
          if (
            sMsg.toLowerCase().includes("already exists") ||
            sMsg.toLowerCase().includes("already registered")
          ) {
            isExisting = true;
            registrationSuccessful = true;
          } else {
            // Fallback to client signUp if server function returns unexpected error
            const { data: fbData, error: fbError } = await supabase.auth.signUp({
              email: cleanEmail,
              password,
              options: {
                data: { full_name: cleanName, phone: cleanPhone },
              },
            });

            if (fbError) {
              const fbMsg = fbError.message || "";
              if (
                fbMsg.toLowerCase().includes("database error") ||
                fbMsg.toLowerCase().includes("already registered") ||
                fbMsg.toLowerCase().includes("already exists")
              ) {
                isExisting = true;
                registrationSuccessful = true;
              } else {
                throw fbError;
              }
            } else if (fbData.user && (!fbData.user.identities || fbData.user.identities.length === 0)) {
              isExisting = true;
              registrationSuccessful = true;
            } else {
              registrationSuccessful = true;
            }
          }
        }

        if (registrationSuccessful) {
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
            if (
              isExisting ||
              signInError.message.toLowerCase().includes("invalid login credentials") ||
              signInError.message.toLowerCase().includes("database error finding user")
            ) {
              toast.info(
                "An account with this email already exists. Please sign in with your password.",
                {
                  duration: 8000,
                  action: {
                    label: "Sign In",
                    onClick: () => setMode("signin"),
                  },
                },
              );
              setMode("signin");
              setLoading(false);
              return;
            }
            throw signInError;
          }

          toast.success(
            isExisting
              ? "Signed in successfully!"
              : "Account created successfully! Welcome to your dashboard.",
          );
          navigate({ to: next, replace: true });
        }
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
          toast.error(
            "Account creation could not be completed with this email. Please check your details or try signing in.",
            {
              duration: 8000,
              action: {
                label: "Sign In",
                onClick: () => setMode("signin"),
              },
            },
          );
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
      className="relative flex min-h-screen items-center justify-center px-5 py-12"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
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
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {mode === "update-password" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <div className="relative">
                        <Input
                          id="newPassword"
                          type={showPassword ? "text" : "password"}
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className="pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          minLength={8}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter new password"
                          className="pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
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
