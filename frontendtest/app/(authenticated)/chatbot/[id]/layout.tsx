"use client";

import { use } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ChatbotSidebar } from "@/components/chatbot-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { Toaster } from "react-hot-toast";
import { useEffect, useState } from "react";
import { authService } from "@/lib/auth";
import { useRouter } from "next/navigation";

interface User {
  uuid: string;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export default function ChatbotLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [chatbotName, setChatbotName] = useState<string>("");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authService.getCurrentUser();
        setUser(userData);
      } catch (error) {
        router.push("/login");
      }
    };

    const fetchChatbot = async () => {
      try {
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const token = document.cookie
          .split("; ")
          .find((row) => row.startsWith("access_token="))
          ?.split("=")[1];

        if (!token) return;

        const response = await fetch(`${API_URL}/api/chatbots/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          setChatbotName(data.name);
        }
      } catch (error) {
        console.error("Failed to fetch chatbot:", error);
      }
    };

    fetchUser();
    fetchChatbot();
  }, [router, id]);

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      <DashboardHeader
        username={user.username}
        email={user.email}
        chatbotName={chatbotName}
        chatbotId={id}
      />
      <div className="flex min-h-screen w-full pt-12">
        <ChatbotSidebar chatbotId={id} />
        <div className="flex-1 flex flex-col">
          <main className="flex-1">{children}</main>
        </div>
      </div>
      <Toaster position="top-right" />
    </SidebarProvider>
  );
}
