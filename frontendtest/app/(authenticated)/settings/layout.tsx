"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authService } from "@/lib/auth";
import { DashboardHeader } from "@/components/dashboard-header";
import { Toaster } from "react-hot-toast";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Settings, Lock } from "lucide-react";

interface User {
  uuid: string;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

const navigationItems = [
  {
    name: "General",
    href: "/settings/profile",
    icon: Settings,
  },
  {
    name: "Password",
    href: "/settings/password",
    icon: Lock,
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authService.getCurrentUser();
        setUser(userData);
      } catch (error) {
        router.push("/login");
      }
    };

    fetchUser();
  }, [router]);

  if (!user) {
    return null;
  }

  const initials = user.username
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <DashboardHeader username={user.username} email={user.email} />
      <div className="min-h-screen pt-12">
        <div className="flex items-start justify-center px-7">
          {/* Left Sidebar Navigation */}
          <div className="sticky top-[calc(3rem+2.5rem)] w-[192px] shrink-0">
            <div className="space-y-8">
              {/* User Info */}
              <div>
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar className="h-10 w-10 shrink-0 text-[#de7f02] border border-[#ffe6d6]">
                    <AvatarFallback className="text-lg bg-[#fff8ee] font-medium">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <h2 className="truncate text-xl font-medium">
                    {user.username}
                  </h2>
                </div>
              </div>

              {/* Navigation Links */}
              <div className="max-w-48 space-y-1">
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`group flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isActive
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 shrink-0 ${
                          isActive ? "text-foreground" : "text-muted-foreground"
                        }`}
                      />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Content Area */}
          <div className="px-6 pt-10 pb-20 mt-16 w-[calc(900px+1.5rem)] max-w-none pr-0 pl-12 xl:px-12">
            <div className="mx-auto flex w-full items-start justify-center">
              <div className="w-full">{children}</div>
            </div>
          </div>
        </div>
      </div>
      <Toaster position="top-right" />
    </>
  );
}
