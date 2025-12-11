"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/auth";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { type DateRange } from "react-day-picker";

interface User {
  uuid: string;
  username: string;
  email: string;
}

interface UsageHistoryItem {
  date: string;
  credits_used: number;
}

interface AgentCreditsItem {
  chatbot_uuid: string;
  chatbot_name: string;
  credits_used: number;
}

interface WorkspaceAnalytics {
  usage_history: UsageHistoryItem[];
  credits_per_agent: AgentCreditsItem[];
  total_credits_used: number;
}

interface WorkspaceCredits {
  credits_remaining: number;
  credits_total: number;
  credits_reset_date: string;
  plan_name: string;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<WorkspaceAnalytics | null>(null);
  const [workspaceCredits, setWorkspaceCredits] =
    useState<WorkspaceCredits | null>(null);
  const [totalChatbots, setTotalChatbots] = useState<number>(0);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authService.getCurrentUser();
        setUser(userData);
      } catch (error) {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  useEffect(() => {
    if (user) {
      fetchWorkspaceCredits();
      fetchTotalChatbots();
    }
  }, [user]);

  useEffect(() => {
    if (user && dateRange?.from && dateRange?.to) {
      fetchAnalytics();
    }
  }, [user, dateRange]);

  const fetchWorkspaceCredits = async () => {
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) return;

      const workspaceUuid = localStorage.getItem("current_workspace_uuid");
      if (!workspaceUuid) return;

      const response = await fetch(
        `${API_URL}/api/workspaces/${workspaceUuid}/credits`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setWorkspaceCredits(data);
      }
    } catch (error) {
      console.error("Failed to fetch workspace credits:", error);
    }
  };

  const fetchTotalChatbots = async () => {
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) return;

      const workspaceUuid = localStorage.getItem("current_workspace_uuid");
      if (!workspaceUuid) return;

      const response = await fetch(
        `${API_URL}/api/chatbots?workspace_uuid=${workspaceUuid}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setTotalChatbots(data.length);
      }
    } catch (error) {
      console.error("Failed to fetch chatbots:", error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) return;

      const workspaceUuid = localStorage.getItem("current_workspace_uuid");
      if (!workspaceUuid) {
        setAnalytics({
          usage_history: [],
          credits_per_agent: [],
          total_credits_used: 0,
        });
        return;
      }

      if (!dateRange?.from || !dateRange?.to) return;

      const startDate = startOfDay(dateRange.from).toISOString();
      const endDate = endOfDay(dateRange.to).toISOString();

      const response = await fetch(
        `${API_URL}/api/workspaces/${workspaceUuid}/analytics?start_date=${startDate}&end_date=${endDate}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      } else {
        setAnalytics({
          usage_history: [],
          credits_per_agent: [],
          total_credits_used: 0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
      setAnalytics({
        usage_history: [],
        credits_per_agent: [],
        total_credits_used: 0,
      });
    }
  };

  const formatChartDate = (dateStr: string) => {
    return format(new Date(dateStr), "MMM d");
  };

  // Circular Progress Component
  const CircularProgress = ({
    value,
    max,
    size = 48,
    strokeWidth = 4,
  }: {
    value: number;
    max: number;
    size?: number;
    strokeWidth?: number;
  }) => {
    const percentage = Math.min((value / max) * 100, 100);
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            className="text-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="text-primary transition-all duration-300"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  };

  // Chart configurations
  const usageHistoryConfig = {
    credits_used: {
      label: "Credits Used",
      color: "#e16641",
    },
  } satisfies ChartConfig;

  const creditsPerAgentConfig = {
    credits_used: {
      label: "Credits Used",
      color: "#e16641",
    },
  } satisfies ChartConfig;

  if (!user || loading) {
    return null;
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
                    Analytics
                  </h1>
                  <p className="text-muted-foreground">
                    Usage history and credits per agent
                  </p>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "MMM d")} -{" "}
                            {format(dateRange.to, "MMM d")}
                          </>
                        ) : (
                          format(dateRange.from, "MMM d")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                      className="rounded-lg border shadow-sm"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {analytics && (
                <>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="pt-1">
                        <div className="flex items-start gap-4">
                          <div className="relative shrink-0">
                            <CircularProgress
                              value={analytics.total_credits_used}
                              max={workspaceCredits?.credits_total || 1}
                              size={48}
                              strokeWidth={4}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-bold">
                                {analytics.total_credits_used.toLocaleString()}
                              </span>
                              <span className="text-muted-foreground text-lg">
                                /{" "}
                                {workspaceCredits?.credits_total.toLocaleString() ||
                                  0}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              Credits used
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-1">
                        <div className="flex items-start gap-4">
                          <div className="relative shrink-0">
                            <CircularProgress
                              value={analytics.credits_per_agent.length}
                              max={totalChatbots || 1}
                              size={48}
                              strokeWidth={4}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-bold">
                                {analytics.credits_per_agent.length}
                              </span>
                              <span className="text-muted-foreground text-lg">
                                / {totalChatbots}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              Active Agents
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Usage History Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Usage History</CardTitle>
                      <CardDescription>
                        Credits used over time in the selected date range
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {analytics.usage_history.length > 0 ? (
                        <ChartContainer
                          config={usageHistoryConfig}
                          className="min-h-[350px] w-full"
                        >
                          <AreaChart data={analytics.usage_history}>
                            <defs>
                              <linearGradient
                                id="colorCredits"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor="var(--color-credits_used)"
                                  stopOpacity={0.8}
                                />
                                <stop
                                  offset="95%"
                                  stopColor="var(--color-credits_used)"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              className="stroke-muted"
                            />
                            <XAxis
                              dataKey="date"
                              tickFormatter={formatChartDate}
                              className="text-xs"
                            />
                            <YAxis className="text-xs" />
                            <ChartTooltip
                              content={
                                <ChartTooltipContent
                                  labelFormatter={(value) =>
                                    formatChartDate(value)
                                  }
                                />
                              }
                            />
                            <Area
                              type="monotone"
                              dataKey="credits_used"
                              stroke="var(--color-credits_used)"
                              fillOpacity={1}
                              fill="url(#colorCredits)"
                            />
                          </AreaChart>
                        </ChartContainer>
                      ) : (
                        <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                          No usage data available for the selected date range
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Credits Per Agent Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Credits Used Per Agent</CardTitle>
                      <CardDescription>
                        Total credits consumed by each chatbot in your workspace
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {analytics.credits_per_agent.length > 0 ? (
                        <ChartContainer
                          config={creditsPerAgentConfig}
                          className="min-h-[350px] w-full"
                        >
                          <BarChart
                            data={analytics.credits_per_agent}
                            accessibilityLayer
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              className="stroke-muted"
                            />
                            <XAxis
                              dataKey="chatbot_name"
                              angle={-45}
                              textAnchor="end"
                              height={100}
                              className="text-xs"
                            />
                            <YAxis className="text-xs" />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar
                              dataKey="credits_used"
                              fill="var(--color-credits_used)"
                              radius={[8, 8, 0, 0]}
                            />
                          </BarChart>
                        </ChartContainer>
                      ) : (
                        <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                          No agent data available for the selected date range
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
