import { useTheme } from "@/context/ThemeContext";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Laptop, Check } from "lucide-react";

interface ThemeToggleProps {
  variant?: "button" | "dropdown";
  className?: string;
  size?: "sm" | "default" | "icon";
}

export function ThemeToggle({
  variant = "dropdown",
  className = "",
  size = "sm",
}: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (variant === "button") {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={toggleTheme}
        className={`h-8 gap-1.5 rounded-sm text-xs transition-colors ${className}`}
        title={`Switch to ${resolvedTheme === "dark" ? "Light" : "Dark"} mode`}
        aria-label="Toggle theme mode"
      >
        {mounted && resolvedTheme === "dark" ? (
          <>
            <Moon className="size-3.5 text-sky-400" />
            <span className="hidden sm:inline">Dark</span>
          </>
        ) : (
          <>
            <Sun className="size-3.5 text-amber-500" />
            <span className="hidden sm:inline">{mounted ? "Light" : ""}</span>
          </>
        )}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={size}
          className={`h-8 gap-1.5 rounded-sm text-xs border-border/80 bg-background/60 hover:bg-accent ${className}`}
          title="Change theme (Light / Dark / System)"
          aria-label="Select theme"
        >
          {mounted && resolvedTheme === "dark" ? (
            <Moon className="size-3.5 text-sky-400" />
          ) : (
            <Sun className="size-3.5 text-amber-500" />
          )}
          <span className="font-medium capitalize hidden sm:inline">
            {mounted ? (theme === "system" ? "System" : resolvedTheme === "dark" ? "Dark" : "Light") : "Theme"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36 text-xs">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Sun className="size-4 text-amber-500" /> Light
          </span>
          {theme === "light" && <Check className="size-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Moon className="size-4 text-sky-400" /> Dark
          </span>
          {theme === "dark" && <Check className="size-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Laptop className="size-4 text-muted-foreground" /> System
          </span>
          {theme === "system" && <Check className="size-3.5 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
