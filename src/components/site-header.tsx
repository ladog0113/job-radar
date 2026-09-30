"use client";

import { useEffect, useState } from "react";
import { Moon, SidebarIcon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";

export function SiteHeader() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { toggleSidebar } = useSidebar();

  useEffect(() => setMounted(true), []);

  const current = theme === "system" ? systemTheme : theme;

  return (
    <header className="sticky top-0 z-50 flex w-full items-center border-b bg-background">
      <div className="flex h-[--header-height] w-full items-center justify-between gap-2 px-2">
        <div className="flex items-center gap-2">
          <Button className="h-8 w-8" variant="ghost" size="icon" onClick={toggleSidebar}>
            <SidebarIcon />
          </Button>
          <Separator orientation="vertical" className="mr-2 h-4" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setTheme(current === "light" ? "dark" : "light")}
        >
          {mounted ? current === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" /> : null}
        </Button>
      </div>
    </header>
  );
}
