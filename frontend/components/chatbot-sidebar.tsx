"use client";

import {
  MessageCircle,
  BarChart3,
  Database,
  PlayCircle,
  Zap,
  Users,
  Rocket,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";

interface ChatbotSidebarProps {
  chatbotId: string;
}

const getMenuItems = (chatbotId: string) => [
  {
    title: "Playground",
    icon: PlayCircle,
    href: `/chatbot/${chatbotId}/playground`,
    comingSoon: false,
  },
  {
    title: "Chats",
    icon: MessageCircle,
    href: `/chatbot/${chatbotId}/activity`,
    comingSoon: false,
  },
  {
    title: "Analytics",
    icon: BarChart3,
    href: `/chatbot/${chatbotId}/analytics`,
    comingSoon: false,
  },
  {
    title: "Sources",
    icon: Database,
    href: `/chatbot/${chatbotId}/sources`,
    comingSoon: false,
  },
  {
    title: "Actions",
    icon: Zap,
    href: `/chatbot/${chatbotId}/actions`,
    comingSoon: true,
  },
  {
    title: "Contacts",
    icon: Users,
    href: `/chatbot/${chatbotId}/contacts`,
    comingSoon: true,
  },
  {
    title: "Deploy & Integrations",
    icon: Rocket,
    href: `/chatbot/${chatbotId}/deploy`,
    comingSoon: false,
  },
];

export function ChatbotSidebar({ chatbotId }: ChatbotSidebarProps) {
  const pathname = usePathname();
  const menuItems = getMenuItems(chatbotId);
  const [credits, setCredits] = useState({
    remaining: 0,
    total: 0,
    resetDate: null as string | null,
  });
  const [hasPlan, setHasPlan] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const token = document.cookie
          .split("; ")
          .find((row) => row.startsWith("access_token="))
          ?.split("=")[1];

        if (!token) {
          setIsLoading(false);
          return;
        }

        // Get current workspace from localStorage
        const workspaceUuid = localStorage.getItem("current_workspace_uuid");
        
        if (workspaceUuid) {
          // Fetch workspace credits (owner's credits)
          const workspaceResponse = await fetch(
            `${API_URL}/api/workspaces/${workspaceUuid}/credits`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
              credentials: "include",
            }
          );

          if (workspaceResponse.ok) {
            const workspaceData = await workspaceResponse.json();
            setCredits({
              remaining: workspaceData.credits_remaining || 0,
              total: workspaceData.credits_total || 0,
              resetDate: workspaceData.credits_reset_date || null,
            });
          }
        } else {
          // Fallback to user credits if no workspace selected
          const userResponse = await fetch(`${API_URL}/api/user/credits`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });

          if (userResponse.ok) {
            const userData = await userResponse.json();
          setCredits({
              remaining: userData.credits_remaining || 0,
              total: userData.credits_total || 0,
              resetDate: userData.credits_reset_date || null,
          });
          }
        }

        // Check if user has a plan
        const userResponse = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setHasPlan(userData.plan_id !== null && userData.plan_id !== undefined);
        }
      } catch (error) {
        console.error("Failed to fetch credits:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCredits();

    // Refresh credits every 30 seconds
    const interval = setInterval(fetchCredits, 30000);
    
    // Also listen for workspace changes in localStorage
    const handleStorageChange = () => {
      fetchCredits();
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Custom event for workspace changes (since localStorage events don't fire in same tab)
    window.addEventListener('workspace-changed', handleStorageChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('workspace-changed', handleStorageChange);
    };
  }, []);

  const used = credits.total - credits.remaining;
  const percentageUsed = credits.total > 0 ? (used / credits.total) * 100 : 0;

  // Format reset date
  const formatResetDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <Sidebar className="border-r pt-12">
      <SidebarContent className="font-['Inter']">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    className="h-9 text-gray-600 hover:text-black data-[active=true]:text-black data-[active=true]:bg-gray-200"
                  >
                    <Link
                      href={item.href}
                      className="flex items-center justify-between gap-3 px-3 py-1 text-[14px] font-medium leading-5"
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className="w-5 h-5 shrink-0" />
                        <span>{item.title}</span>
                      </div>
                      {item.comingSoon && (
                        <Badge
                          variant="secondary"
                          className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-300 text-[10px] px-1.5 py-0.5 h-4"
                        >
                          Coming Soon
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t bg-muted/30">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Message credits
            </span>
            {isLoading ? (
              <span className="text-xs text-muted-foreground">Loading...</span>
            ) : (
              <span className="text-xs font-semibold text-foreground">
                {credits.remaining === 0
                  ? `${used.toLocaleString()} / ${credits.total.toLocaleString()}`
                  : `${credits.remaining.toLocaleString()} / ${credits.total.toLocaleString()}`}
              </span>
            )}
          </div>

          {!isLoading && (
            <>
              <Progress value={percentageUsed} className="h-1.5" />

              {credits.resetDate && (
                <p className="text-xs text-muted-foreground">
                  Resets on {formatResetDate(credits.resetDate)}
                </p>
              )}

              {hasPlan && (
              <Button
                variant="default"
                size="sm"
                className="w-full text-xs h-8 mt-2"
                onClick={() => {
                  // TODO: Navigate to upgrade page or open upgrade modal
                  window.location.href = "/dashboard/upgrade";
                }}
              >
                Upgrade
              </Button>
              )}
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
