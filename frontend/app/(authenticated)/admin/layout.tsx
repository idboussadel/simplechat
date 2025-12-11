"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/auth";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
} from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";

interface User {
  uuid: string;
  username: string;
  email: string;
  user_type: string;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const userData = await authService.getCurrentUser();
        setUser(userData);
        console.log(userData);
        // Check if user is admin
        if (userData.user_type !== "admin") {
          // Redirect to dashboard if not admin
          router.push("/dashboard");
          return;
        }

        setIsAuthorized(true);
      } catch (error) {
        // Redirect to login if not authenticated
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized || !user) {
    return null; // Will redirect
  }

  return (
    <SidebarProvider>
      <DashboardHeader username={user.username} email={user.email} />
      <div className="flex min-h-screen w-full pt-12">
        <Sidebar className="border-r pt-12">
          <SidebarContent className="font-['Inter']">
            <AdminSidebar />
          </SidebarContent>
        </Sidebar>
        <div className="flex-1">{children}</div>
      </div>
    </SidebarProvider>
  );
}
