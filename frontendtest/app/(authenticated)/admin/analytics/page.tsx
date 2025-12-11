"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users,
  Building2,
  Bot,
  MessageSquare,
  MessageCircle,
  TrendingUp,
  UserPlus,
  Activity,
} from "lucide-react";

interface User {
  uuid: string;
  username: string;
  email: string;
  user_type: string;
}

interface AdminAnalytics {
  total_users: number;
  total_workspaces: number;
  total_chatbots: number;
  total_conversations: number;
  total_messages: number;
  active_users_24h: number;
  active_users_7d: number;
  active_users_30d: number;
  new_users_today: number;
  new_users_7d: number;
  new_users_30d: number;
  users_by_type: {
    admin: number;
    normal: number;
    customer_service: number;
  };
  conversations_today: number;
  conversations_7d: number;
  conversations_30d: number;
  messages_today: number;
  messages_7d: number;
  messages_30d: number;
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authService.getCurrentUser();
        setUser(userData);

        // Security check: Only admins can access
        if (userData.user_type !== "admin") {
          router.push("/dashboard");
          return;
        }

        fetchAnalytics();
      } catch (error) {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  const fetchAnalytics = async () => {
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) return;

      const response = await fetch(`${API_URL}/api/admin/analytics`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (response.status === 403) {
        router.push("/dashboard");
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Failed to load analytics</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Analytics</h1>
            <p className="text-muted-foreground">
              Monitor your application's performance and usage
            </p>
          </div>

          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.total_users}</div>
                <p className="text-xs text-muted-foreground">
                  {analytics.new_users_today} new today
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Workspaces</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.total_workspaces}</div>
                <p className="text-xs text-muted-foreground">
                  Active workspaces
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Chatbots</CardTitle>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.total_chatbots}</div>
                <p className="text-xs text-muted-foreground">
                  Total chatbots created
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conversations</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.total_conversations}</div>
                <p className="text-xs text-muted-foreground">
                  {analytics.conversations_today} today
                </p>
              </CardContent>
            </Card>
          </div>

          {/* User Activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>User Activity</CardTitle>
                <CardDescription>Active users by time period</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Last 24 hours</span>
                  </div>
                  <span className="text-lg font-semibold">
                    {analytics.active_users_24h}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Last 7 days</span>
                  </div>
                  <span className="text-lg font-semibold">
                    {analytics.active_users_7d}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Last 30 days</span>
                  </div>
                  <span className="text-lg font-semibold">
                    {analytics.active_users_30d}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>New Users</CardTitle>
                <CardDescription>User registrations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Today</span>
                  </div>
                  <span className="text-lg font-semibold">
                    {analytics.new_users_today}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Last 7 days</span>
                  </div>
                  <span className="text-lg font-semibold">
                    {analytics.new_users_7d}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Last 30 days</span>
                  </div>
                  <span className="text-lg font-semibold">
                    {analytics.new_users_30d}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Users by Type</CardTitle>
                <CardDescription>User type distribution</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Admin</span>
                  <span className="text-lg font-semibold">
                    {analytics.users_by_type.admin}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Normal</span>
                  <span className="text-lg font-semibold">
                    {analytics.users_by_type.normal}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Customer Service</span>
                  <span className="text-lg font-semibold">
                    {analytics.users_by_type.customer_service}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Messages & Conversations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Conversations</CardTitle>
                <CardDescription>Conversation activity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Today</span>
                  <span className="text-lg font-semibold">
                    {analytics.conversations_today}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Last 7 days</span>
                  <span className="text-lg font-semibold">
                    {analytics.conversations_7d}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Last 30 days</span>
                  <span className="text-lg font-semibold">
                    {analytics.conversations_30d}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-medium">Total</span>
                  <span className="text-xl font-bold">
                    {analytics.total_conversations}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Messages</CardTitle>
                <CardDescription>Message activity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Today</span>
                  <span className="text-lg font-semibold">
                    {analytics.messages_today}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Last 7 days</span>
                  <span className="text-lg font-semibold">
                    {analytics.messages_7d}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Last 30 days</span>
                  <span className="text-lg font-semibold">
                    {analytics.messages_30d}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-medium">Total</span>
                  <span className="text-xl font-bold">
                    {analytics.total_messages}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

