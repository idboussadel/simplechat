"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Ticket } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const menuItems = [
  {
    title: "Analytics",
    icon: BarChart3,
    href: "/admin/analytics",
  },
  {
    title: "Tickets",
    icon: Ticket,
    href: "/admin/tickets",
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={
                  pathname === item.href ||
                  (item.href !== "/admin/analytics" &&
                    pathname?.startsWith(item.href))
                }
                className="h-9 text-gray-600 hover:text-black data-[active=true]:text-black data-[active=true]:bg-gray-200"
              >
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-1 text-[14px] font-medium leading-5"
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
