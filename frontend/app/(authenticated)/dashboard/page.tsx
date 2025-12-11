"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/auth";
import { CreateChatbotModal } from "./create-chatbot-modal";
import { EnrollmentPage } from "./enrollment-page";
import toast, { Toaster } from "react-hot-toast";
import Link from "next/link";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { MoreVertical, Bot } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface User {
  uuid: string;
  username: string;
  email: string;
  is_active: boolean;
  user_type: string;
  created_at: string;
}

interface Chatbot {
  uuid: string;
  user_uuid: string;
  name: string;
  description: string | null;
  language: string;
  tone: string;
  instructions: string | null;
  model_name: string;
  is_active: boolean;
  created_at: string;
  // Styling fields
  color_primary: string;
  color_user_message: string;
  color_bot_message: string;
  color_background: string;
  border_radius_chatbot: number;
  border_radius_messages: number;
  border_radius_input: number;
}

interface Workspace {
  uuid: string;
  name: string;
  description: string | null;
  owner_uuid: string;
  created_at: string;
  credits_remaining: number;
  credits_total: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const handleToggleActive = async (
    chatbotId: string,
    currentStatus: boolean
  ) => {
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) return;

      const response = await fetch(`${API_URL}/api/chatbots/${chatbotId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ is_active: !currentStatus }),
      });

      if (response.ok) {
        toast.success(
          `Chatbot ${!currentStatus ? "activated" : "deactivated"}`
        );
        fetchChatbots();
      } else {
        toast.error("Failed to update chatbot status");
      }
    } catch (error) {
      console.error("Failed to toggle chatbot:", error);
      toast.error("Failed to update chatbot status");
    }
  };

  const handleDeleteChatbot = async (chatbotId: string) => {
    // TODO: Implement delete functionality
    toast.success("Delete functionality coming soon");
  };

  const fetchWorkspaces = async () => {
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) return;

      const response = await fetch(`${API_URL}/api/workspaces`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setWorkspaces(data);
      }
    } catch (error) {
      console.error("Failed to fetch workspaces:", error);
    }
  };

  const fetchChatbots = async () => {
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) return;

      const response = await fetch(`${API_URL}/api/chatbots`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setChatbots(data);
      }
    } catch (error) {
      console.error("Failed to fetch chatbots:", error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const userData = await authService.getCurrentUser();
        setUser(userData);

        // Redirect admin users to admin dashboard
        if (userData.user_type === "admin") {
          router.push("/admin/analytics");
          return;
        }

        await fetchWorkspaces();
        await fetchChatbots();
      } catch (error) {
        // Silently redirect to login if not authenticated
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleEnrollmentComplete = () => {
    fetchWorkspaces();
    fetchChatbots();
  };

  const handleLogout = () => {
    authService.logout();
    router.push("/login");
  };

  if (!user || loading) {
    return null;
  }

  // Show enrollment page if user has no workspaces
  if (workspaces.length === 0) {
    return (
      <SidebarProvider>
        <DashboardHeader username={user.username} email={user.email} />
        <div className="flex min-h-screen w-full pt-12">
          <EnrollmentPage onComplete={handleEnrollmentComplete} />
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <DashboardHeader username={user.username} email={user.email} />
      <div className="flex min-h-screen w-full pt-12">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">
                    Chatbots
                  </h1>
                  <p className="text-muted-foreground">
                    Manage your AI chatbots
                  </p>
                </div>
                <CreateChatbotModal onSuccess={fetchChatbots} />
              </div>

              {chatbots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                  <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">No chatbots yet</h3>
                  <p className="text-muted-foreground mt-2 max-w-sm">
                    Create your first chatbot to get started with AI-powered
                    conversations
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {chatbots.map((chatbot) => (
                    <div
                      key={chatbot.uuid}
                      className="border rounded-lg bg-card hover:shadow-md transition-all overflow-hidden flex flex-col"
                    >
                      {/* Preview Container with Chatbot Colors */}
                      <Link
                        href={`/chatbot/${chatbot.uuid}/playground`}
                        className="block h-[12.5rem] w-full overflow-hidden relative"
                      >
                        <div
                          className="relative flex h-full w-full select-none items-end justify-center overflow-hidden"
                          style={{
                            backgroundColor: chatbot.color_primary || "#000000",
                          }}
                        >
                          {/* Mini Chatbot Preview */}
                          <div
                            className="z-20 flex h-[90%] w-[min(230px,90%)] flex-col items-center justify-start overflow-hidden rounded-t-[14px]"
                            style={{
                              maxWidth: "min(230px, 90%)",
                              backgroundColor:
                                chatbot.color_background || "#FFFFFF",
                              borderRadius: `${
                                chatbot.border_radius_chatbot || 16
                              }px ${chatbot.border_radius_chatbot || 16}px 0 0`,
                            }}
                          >
                            {/* Chatbot Header */}
                            <div
                              className="flex h-10 w-full flex-row items-center justify-start gap-1 rounded-[15px] rounded-b-none px-3 py-2"
                              style={{
                                background: `linear-gradient(0deg, rgba(0, 0, 0, 0.02) 0.44%, rgba(0, 0, 0, 0) 49.5%), ${
                                  chatbot.color_background || "#FFFFFF"
                                }`,
                              }}
                            >
                              <div className="size-6 shrink-0 overflow-hidden rounded-full">
                                <img
                                  alt={`${chatbot.name} thumbnail`}
                                  loading="lazy"
                                  width={26}
                                  height={26}
                                  decoding="async"
                                  className="h-full w-full object-cover"
                                  src="/chat-logo.png"
                                />
                              </div>
                              <p className="line-clamp-1 w-full origin-left font-medium text-[10px] leading-normal tracking-tight text-black">
                                {chatbot.name}
                              </p>
                            </div>

                            {/* Chat Messages Preview */}
                            <div className="relative flex w-full flex-grow flex-col gap-2 overflow-clip border-x-[0.25px] bg-white p-2">
                              {/* Bot Message */}
                              <div
                                className="z-10 w-1/2 max-w-full flex-col gap-2 px-4 py-3.5"
                                style={{
                                  backgroundColor:
                                    chatbot.color_bot_message || "#F3F4F6",
                                  borderTopLeftRadius: `12px`,
                                  borderTopRightRadius: `12px`,
                                  borderBottomRightRadius: `12px`,
                                  borderBottomLeftRadius: "0px",
                                }}
                              />
                              {/* User Message */}
                              <div
                                className="z-10 ml-auto w-1/2 max-w-full px-4 py-3.5 font-sans"
                                style={{
                                  backgroundColor:
                                    chatbot.color_user_message || "#000000",
                                  borderTopLeftRadius: `12px`,
                                  borderTopRightRadius: `12px`,
                                  borderBottomLeftRadius: `12px`,
                                  borderBottomRightRadius: "0px",
                                }}
                              />
                            </div>
                          </div>

                          {/* Background Overlay with Primary Color */}
                          <div
                            className="absolute inset-0 h-full w-full scale-110"
                            style={{
                              filter: "brightness(0.95)",
                              backgroundColor:
                                chatbot.color_primary || "#000000",
                            }}
                          />
                        </div>
                      </Link>

                      {/* Bottom Info Section */}
                      <div className="border-t bg-white p-4">
                        <div className="flex items-center justify-between">
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() =>
                              router.push(`/chatbot/${chatbot.uuid}/activity`)
                            }
                          >
                            <h3 className="font-semibold text-base mb-1 truncate">
                              {chatbot.name}
                            </h3>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {chatbot.description || chatbot.language}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Switch
                              checked={chatbot.is_active}
                              onCheckedChange={() =>
                                handleToggleActive(
                                  chatbot.uuid,
                                  chatbot.is_active
                                )
                              }
                              className="data-[state=checked]:bg-green-500"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleDeleteChatbot(chatbot.uuid)
                                  }
                                  className="text-destructive focus:text-destructive"
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
      <Toaster position="top-right" />
    </SidebarProvider>
  );
}
