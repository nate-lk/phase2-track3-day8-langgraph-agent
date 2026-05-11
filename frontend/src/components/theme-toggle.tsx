import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="shrink-0 rounded-full border-border/80 bg-muted/40 shadow-sm"
      onClick={() => toggleTheme()}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? (
        <Sun className="h-[1.1rem] w-[1.1rem]" aria-hidden />
      ) : (
        <Moon className="h-[1.1rem] w-[1.1rem]" aria-hidden />
      )}
    </Button>
  );
}
