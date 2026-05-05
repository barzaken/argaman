"use client";

import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  BookmarkPlus,
  LogOut,
  Plus,
  PlusCircle,
  Settings,
  User,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

export function NavFooter({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  async function handleLogout() {
    const sb = createClient();
    await sb.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <SidebarFooter className="p-4">
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="h-8 w-8 rounded-full">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-full">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="m-2 w-56" align="start">
                  <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer justify-end">
                    פרופיל
                    <User data-icon="inline-start" aria-hidden />
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer justify-end">
                    הגדרות
                    <Settings data-icon="inline-start" aria-hidden />
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer justify-end "
                    onClick={(e) => {
                      e.preventDefault();
                      void handleLogout();
                    }}
                  >
                    יציאה
                    <LogOut data-icon="inline-start" aria-hidden />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  aria-label="הוספה מהירה"
                >
                  <Plus aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-fit pb-2">
                <DropdownMenuLabel>הוסף חדש</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/inventory/new" className="cursor-pointer">
                    <PlusCircle
                      data-icon="inline-start"
                      aria-hidden
                    />
                    הוסף למלאי
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/orders/new" className="cursor-pointer">
                    <BookmarkPlus
                      data-icon="inline-start"
                      aria-hidden
                    />
                    תעודת הזמנה
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
