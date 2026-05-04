"use client";

import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  Building2,
  LogOut,
  Plus,
  PlusCircle,
  Puzzle,
  Settings,
  User,
  Landmark,
} from "lucide-react";

export function NavFooter({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {

  return (
    <SidebarFooter className="p-4">
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="h-8 w-8 rounded-full">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-full">NY</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="m-2 w-56" align="start">
                  <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                    מצב מערכת
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <User size={16} className="opacity-80" aria-hidden />
                    פרופיל
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings
                      size={16}
                      className="opacity-80"
                      aria-hidden
                    />
                    הגדרות
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <LogOut size={16} className="opacity-80" aria-hidden />
                    יציאה
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
                  <Plus size={16} aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-fit pb-2">
                <DropdownMenuLabel>הוסף חדש</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/inventory/new" className="cursor-pointer">
                    <PlusCircle
                      size={16}
                      className="me-2 opacity-80"
                      aria-hidden
                    />
                    הוסף למלאי
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/orders/new" className="cursor-pointer">
                    <BookmarkPlus
                      size={16}
                      className="me-2 opacity-80"
                      aria-hidden
                    />
                    תעודת הזמנה
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/dashboard/deliveries/new"
                    className="cursor-pointer"
                  >
                    <Puzzle
                      size={16}
                      className="me-2 opacity-80"
                      aria-hidden
                    />
                    תעודת משלוח
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
