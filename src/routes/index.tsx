import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicSettings } from "@/lib/public.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  Router,
  Smartphone,
  ShieldCheck,
  Users,
  Gauge,
  Building2,
  ArrowRight,
  Wifi,
  Lock,
  Zap,
  Activity,
  Cpu,
  Globe,
  MessageCircle,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: ({ loaderData }) => {
    const trial = loaderData?.settings?.trialDays ?? 3;
    const price = loaderData?.settings?.subscriptionPriceKes ?? 1500;
    const desc = `Run your ISP business on autopilot: Automated payments, MikroTik Hotspot/PPPoE activation and expiry, and per-business isolation. ${trial}-day free trial. Starting at KES ${price.toLocaleString()}/mo. Supporting Kenya, Tanzania, Uganda, and Rwanda.`;

    return {
      meta: [
        { title: "Wifi Billing" },
        { name: "description", content: desc },
        { property: "og:title", content: "Wifi Billing" },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://wifibilling.site/" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: "https://wifibilling.site/" }],
    };
  },
  loader: async () => {
    return {
      settings: await getPublicSettings(),
    };
  },
  component: Landing,
});

const features = [
  {
    icon: Router,
    title: "MikroTik on autopilot",
    body: "An on-site agent talks to your router over a secure outbound link — no port forwarding, no static IP. Users are activated and cut off automatically.",
  },
  {
    icon: Smartphone,
    title: "Mobile Money Automation",
    body: "Customers pay via M-Pesa (Kenya/Tanzania), Airtel Money, or MTN. Payments land in your account, activation happens seconds later.",
  },
  {
    icon: ShieldCheck,
    title: "Hard tenant isolation",
    body: "Every business sees only its own routers, packages, customers and money. Enforced in the database, not in the UI.",
  },
  {
    icon: Users,
    title: "Customer self-service",
    body: "Branded captive portal where subscribers pick a package, pay, and get online without calling you.",
  },
  {
    icon: Gauge,
    title: "Live operations view",
    body: "Active sessions, expiring accounts, failed payments and router health in one operations dashboard.",
  },
  {
    icon: Building2,
    title: "Built for ISPs",
    body: "Multi-currency support (KES, TZS, UGX, RWF), regional payment gateways, and the workflows local providers actually use.",
  },
];

function SpinningGlobeCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Globe Sphere (Wireframe / Point Cloud style)
    const sphereGroup = new THREE.Group();
    scene.add(sphereGroup);

    const globeGeometry = new THREE.SphereGeometry(1.6, 48, 48);
    const globeMaterial = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    const globeMesh = new THREE.Mesh(globeGeometry, globeMaterial);
    sphereGroup.add(globeMesh);

    // Inner glowing core
    const coreGeometry = new THREE.SphereGeometry(1.55, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.08,
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    sphereGroup.add(coreMesh);

    // Lat / Long rings / Orbit arcs
    const ringGeo1 = new THREE.RingGeometry(1.9, 1.93, 64);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
    });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.rotation.x = Math.PI / 3;
    sphereGroup.add(ring1);

    const ring2 = new THREE.Mesh(ringGeo1, ringMat1.clone());
    ring2.rotation.y = Math.PI / 4;
    sphereGroup.add(ring2);

    // Particle dots on surface (representing active ISP nodes)
    const particleCount = 200;
    const pGeometry = new THREE.BufferGeometry();
    const pPositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 1.62;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      pPositions[i * 3] = x;
      pPositions[i * 3 + 1] = y;
      pPositions[i * 3 + 2] = z;
    }

    pGeometry.setAttribute("position", new THREE.BufferAttribute(pPositions, 3));
    const pMaterial = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.05,
      transparent: true,
      opacity: 0.8,
    });
    const particlePoints = new THREE.Points(pGeometry, pMaterial);
    sphereGroup.add(particlePoints);

    let animationId: number;
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      mouseX = x * 0.0005;
      mouseY = y * 0.0005;
    };

    window.addEventListener("mousemove", handleMouseMove);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      // Auto rotation + mouse tilt
      targetRotationY += 0.003 + (mouseX - targetRotationY) * 0.05;
      targetRotationX += (mouseY - targetRotationX) * 0.05;

      sphereGroup.rotation.y = targetRotationY;
      sphereGroup.rotation.x = targetRotationX;

      ring1.rotation.z += 0.005;
      ring2.rotation.z -= 0.004;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full pointer-events-none opacity-80 z-0"
    />
  );
}

function Landing() {
  const { settings } = Route.useLoaderData();
  const price = settings?.subscriptionPriceKes ?? 1500;
  const trial = settings?.trialDays ?? 3;

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setMousePos({ x: x / 15, y: -y / 15 });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden relative">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-tr from-primary to-indigo-500 text-primary-foreground shadow-lg shadow-primary/25 transition-transform duration-300 group-hover:scale-110">
              <Wifi className="size-5 animate-pulse" />
            </span>
            <div className="flex flex-col">
              <span className="font-display text-lg font-bold tracking-tight">Wifi Billing</span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                ISP Billing Platform
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Badge
              variant="outline"
              className="hidden lg:flex items-center gap-1.5 py-1 px-3 bg-card/50 border-primary/20 text-xs"
            >
              <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
              Regional MikroTik & Payment Nodes Active
            </Badge>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="hidden md:flex items-center gap-1.5 border-emerald-500/30 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-950/50"
            >
              <a href="https://wa.me/254768926965" target="_blank" rel="noreferrer">
                <MessageCircle className="size-3.5" />
                <span className="font-medium">+254 768 926 965</span>
              </a>
            </Button>
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="font-medium">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
            >
              <Link to="/auth" search={{ mode: "signup" }}>
                Start free trial
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="relative overflow-hidden pt-12 pb-24 lg:pt-20 lg:pb-32">
          <SpinningGlobeCanvas />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background pointer-events-none z-10" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-2 z-20">
            <div className="flex flex-col items-start text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary backdrop-blur-md mb-6 shadow-sm">
                <Zap className="size-3.5 text-primary animate-bounce" />
                {trial} Days Free Trial · No Credit Card Required
              </div>

              <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl leading-[1.08]">
                Next-Gen ISP <br />
                <span className="bg-gradient-to-r from-primary via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                  Billing & Automation
                </span>
              </h1>

              <p className="mt-6 text-lg text-muted-foreground sm:text-xl max-w-xl leading-relaxed">
                Connect your MikroTik routers directly to M-Pesa & Mobile Money. Automated
                provisioning, instant receipt validation, and hard tenant isolation engineered for
                modern ISPs.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Button
                  asChild
                  size="lg"
                  className="h-12 px-8 text-base shadow-xl shadow-primary/25 hover:scale-105 transition-all"
                >
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Launch Your ISP Now <ArrowRight className="ml-2 size-5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 px-8 text-base backdrop-blur-md bg-card/40 border-border/80 hover:bg-card"
                >
                  <Link to="/auth">Sign In to Dashboard</Link>
                </Button>
              </div>

              <div className="mt-10 grid grid-cols-3 gap-6 pt-8 border-t border-border/60 w-full">
                <div>
                  <div className="text-2xl font-bold font-display text-primary">99.9%</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Uptime SLA</div>
                </div>
                <div>
                  <div className="text-2xl font-bold font-display text-indigo-500">&lt; 3s</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Payment Processing</div>
                </div>
                <div>
                  <div className="text-2xl font-bold font-display text-cyan-500">
                    KES {price.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Monthly Plan</div>
                </div>
              </div>
            </div>

            <div className="relative flex items-center justify-center lg:justify-end">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-primary/20 via-indigo-500/10 to-cyan-500/20 blur-2xl opacity-70 animate-pulse" />

              <div
                ref={cardRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                  transform: `perspective(1000px) rotateX(${mousePos.y}deg) rotateY(${mousePos.x}deg)`,
                  transition: "transform 0.1s ease-out",
                }}
                className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-card/80 p-6 shadow-2xl backdrop-blur-2xl"
              >
                <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/20 text-primary">
                      <Cpu className="size-5" />
                    </span>
                    <div>
                      <div className="font-semibold text-sm">Router Node #MK-01</div>
                      <div className="text-xs text-emerald-500 flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
                        Connected & Synchronized
                      </div>
                    </div>
                  </div>
                  <Badge className="bg-primary/10 text-primary">PPPoE & Hotspot</Badge>
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl bg-background/50 border border-border/60 p-4 space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground font-medium">
                      <span>Live Mobile Money Event</span>
                      <span className="text-emerald-500 font-semibold">Success</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Smartphone className="size-4 text-primary" />
                        <span className="text-sm font-mono">+254 712 *** 890</span>
                      </div>
                      <span className="text-sm font-bold font-mono text-primary">KES 1,500</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                      <span>Receipt: QHX9823145</span>
                      <span>Just now</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-background/50 border border-border/60 p-3.5">
                      <div className="text-xs text-muted-foreground">Active Sessions</div>
                      <div className="text-xl font-bold font-display mt-1">428 Users</div>
                    </div>
                    <div className="rounded-2xl bg-background/50 border border-border/60 p-3.5">
                      <div className="text-xs text-muted-foreground">Bandwidth Load</div>
                      <div className="text-xl font-bold font-display mt-1 text-indigo-500">
                        1.2 Gbps
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Activity className="size-3.5 text-primary" />
                    Automated Router Expiry Guard
                  </span>
                  <span className="font-semibold text-foreground">Active</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-24 relative z-20">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold sm:text-5xl font-display tracking-tight">
              Engineered for Scale & Reliability
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Wifi Billing replaces manual Winbox scripts, WhatsApp payment confirmations, and
              expired subscriber friction with absolute automation.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="group relative rounded-3xl border border-border/80 bg-card/60 p-8 transition-all duration-300 hover:-translate-y-2 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10 backdrop-blur-xl"
              >
                <div className="absolute top-0 right-0 p-6 text-muted-foreground/20 font-mono font-bold text-2xl group-hover:text-primary/30 transition-colors">
                  0{i + 1}
                </div>
                <span className="mb-6 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground shadow-md shadow-primary/20">
                  <f.icon className="size-6" />
                </span>
                <h3 className="text-xl font-bold font-display">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="relative border-y border-border/60 bg-gradient-to-b from-card/30 to-card/60 py-24 z-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl font-bold sm:text-4xl font-display">
                How Wifi Billing Works
              </h2>
              <p className="mt-3 text-muted-foreground">
                Four simple steps from zero to fully automated ISP billing.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-4">
              {[
                ["Create Business", "Sign up in seconds and start your trial immediately."],
                ["Connect Router", "Link your MikroTik with our secure outbound agent."],
                ["Define Packages", "Set speed limits, durations, and multi-currency pricing."],
                [
                  "Automated Payments",
                  "Subscribers pay via Mobile Money and get online instantly.",
                ],
              ].map(([title, body], i) => (
                <div
                  key={title}
                  className="relative rounded-3xl border border-border/80 bg-background/80 p-8 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-primary/50 hover:-translate-y-1"
                >
                  <div className="absolute -top-4 left-8 size-9 rounded-xl bg-gradient-to-tr from-primary to-indigo-500 text-primary-foreground font-display font-bold grid place-items-center shadow-lg shadow-primary/30">
                    {i + 1}
                  </div>
                  <h3 className="mt-3 text-lg font-bold font-display">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-28 text-center relative z-20">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-primary/10 via-indigo-500/10 to-cyan-500/10 blur-3xl -z-10" />
          <div className="rounded-3xl border border-border/80 bg-card/80 p-12 lg:p-16 shadow-2xl backdrop-blur-2xl">
            <h2 className="text-3xl font-bold sm:text-5xl font-display tracking-tight">
              Ready to Automate Your ISP?
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto">
              Join thousands of ISPs running their networks effortlessly with Wifi Billing. {trial}{" "}
              days free, then KES {price.toLocaleString()} / month.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button
                asChild
                size="lg"
                className="h-12 px-8 text-base shadow-xl shadow-primary/25 hover:scale-105 transition-all"
              >
                <Link to="/auth" search={{ mode: "signup" }}>
                  Start Free Trial Now <ArrowRight className="ml-2 size-5" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-10 bg-background/50 relative z-20">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            <p>© {new Date().getFullYear()} Wifi Billing. Wi-Fi & PPPoE Billing for ISPs.</p>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="https://wa.me/254768926965"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-muted-foreground hover:text-emerald-500 transition-colors"
            >
              <MessageCircle className="size-4" />
              <span>+254 768 926 965</span>
            </a>
            <Link to="/auth" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link
              to="/auth"
              search={{ redirect: "/superadmin" }}
              className="text-muted-foreground/30 hover:text-muted-foreground transition-colors p-1.5 rounded-lg hover:bg-muted"
              title="Super Admin Portal"
              aria-label="Super Admin Portal"
            >
              <Lock className="size-4" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
