"use client";

import {
  ChevronsUpDown,
  User,
  CreditCard,
  Bell,
  LogOut,
  Plus,
  Check,
  Bug,
  Building2,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter, usePathname } from "next/navigation";
import { authService } from "@/lib/auth";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { BugReportSheet } from "@/components/bug-report-sheet";
import toast from "react-hot-toast";

interface DashboardHeaderProps {
  username: string;
  email: string;
  chatbotName?: string;
  chatbotId?: string;
  onCreateChatbot?: () => void;
}

interface Chatbot {
  uuid: string;
  name: string;
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

export function DashboardHeader({
  username,
  email,
  chatbotName,
  chatbotId,
  onCreateChatbot,
}: DashboardHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
    null
  );
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState("");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasPlan, setHasPlan] = useState(false);

  const initials = username
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Fetch user type and workspaces on mount (only once)
  useEffect(() => {
    let isMounted = true;

    const checkUserType = async () => {
      try {
        const userData = await authService.getCurrentUser();
        if (!isMounted) return;

        setIsAdmin(userData.user_type === "admin");
        setHasPlan(userData.plan_id !== null && userData.plan_id !== undefined);

        // Don't fetch workspaces or chatbots for admin users
        if (userData.user_type === "admin") {
          return;
        }

        // Fetch workspaces for non-admin users
        const fetchWorkspaces = async () => {
          try {
            const API_URL =
              process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const token = document.cookie
              .split("; ")
              .find((row) => row.startsWith("access_token="))
              ?.split("=")[1];

            if (!token || !isMounted) return;

            const response = await fetch(`${API_URL}/api/workspaces`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
              credentials: "include",
            });

            if (response.ok && isMounted) {
              const data = await response.json();
              setWorkspaces(data);
              // Don't set currentWorkspace here - let the other effect handle it
            }
          } catch (error) {
            console.error("Failed to fetch workspaces:", error);
          }
        };

        fetchWorkspaces();
      } catch (error) {
        console.error("Failed to fetch user:", error);
      }
    };

    checkUserType();

    return () => {
      isMounted = false;
    };
  }, []); // Only run once on mount

  // Fetch chatbots when workspace changes
  useEffect(() => {
    if (!currentWorkspace?.uuid) return;

    let isMounted = true;

    const fetchChatbots = async () => {
      try {
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const token = document.cookie
          .split("; ")
          .find((row) => row.startsWith("access_token="))
          ?.split("=")[1];

        if (!token || !isMounted) return;

        const response = await fetch(
          `${API_URL}/api/chatbots?workspace_uuid=${currentWorkspace.uuid}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
          }
        );

        if (response.ok && isMounted) {
          const data = await response.json();
          setChatbots(data);
        }
      } catch (error) {
        console.error("Failed to fetch chatbots:", error);
      }
    };

    fetchChatbots();

    return () => {
      isMounted = false;
    };
  }, [currentWorkspace?.uuid]); // Only depend on workspace UUID

  // Load workspace from localStorage when workspaces are loaded
  useEffect(() => {
    if (workspaces.length === 0 || currentWorkspace) return;

    const storedWorkspaceUuid = localStorage.getItem("current_workspace_uuid");
    if (storedWorkspaceUuid) {
      const workspace = workspaces.find((w) => w.uuid === storedWorkspaceUuid);
      if (workspace) {
        setCurrentWorkspace(workspace);
      } else if (workspaces.length > 0) {
        // If stored workspace not found, use first workspace
        setCurrentWorkspace(workspaces[0]);
        localStorage.setItem("current_workspace_uuid", workspaces[0].uuid);
      }
    } else if (workspaces.length > 0) {
      // No stored workspace, use first one
      setCurrentWorkspace(workspaces[0]);
      localStorage.setItem("current_workspace_uuid", workspaces[0].uuid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces.length]); // Only depend on workspaces length, not the array itself

  const handleWorkspaceSelect = (workspace: Workspace) => {
    setCurrentWorkspace(workspace);
    localStorage.setItem("current_workspace_uuid", workspace.uuid);
    setWorkspaceMenuOpen(false);
    // Dispatch custom event to notify sidebars of workspace change
    window.dispatchEvent(new Event("workspace-changed"));
    // Refresh chatbots for this workspace
    window.location.reload(); // Simple refresh for now
  };

  const handleCreateWorkspace = async (name: string, description?: string) => {
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) return;

      const response = await fetch(`${API_URL}/api/workspaces`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ name, description }),
      });

      if (response.ok) {
        const newWorkspace = await response.json();
        setWorkspaces([...workspaces, newWorkspace]);
        setCurrentWorkspace(newWorkspace);
        localStorage.setItem("current_workspace_uuid", newWorkspace.uuid);
        setCreateWorkspaceOpen(false);
        toast.success("Workspace created successfully!");
        window.location.reload();
      } else {
        // Handle error response from API
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || "Failed to create workspace";
        toast.error(errorMessage);
      }
    } catch (error: any) {
      console.error("Failed to create workspace:", error);
      toast.error(
        error.message || "Failed to create workspace. Please try again."
      );
    }
  };

  const filteredWorkspaces = workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(workspaceSearchQuery.toLowerCase())
  );

  const handleLogout = () => {
    authService.logout();
    router.push("/login");
  };

  const handleChatbotSelect = (uuid: string) => {
    setIsOpen(false);
    setSearchQuery("");
    // Navigate to the same page but with different chatbot ID
    const currentPath = pathname?.split("/").pop();
    router.push(`/chatbot/${uuid}/${currentPath || "playground"}`);
  };

  const filteredChatbots = chatbots.filter((bot) =>
    bot.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Image
              src="/logo.webp"
              alt="chatsimple"
              width={28}
              height={28}
              className="rounded-lg object-contain"
            />
            <span className="font-semibold text-base">ChatSimple</span>
          </Link>

          {/* Workspace Switcher - Hide for admin users */}
          {!isAdmin && workspaces.length > 0 && (
            <>
              <span className="hidden size-6 place-content-center justify-center text-center font-medium text-muted-foreground/30 md:inline-flex">
                /
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="flex items-center gap-2 cursor-pointer transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm px-1 py-0.5"
                >
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {currentWorkspace?.name || "Select Workspace"}
                  </span>
                </button>
                <DropdownMenu
                  open={workspaceMenuOpen}
                  onOpenChange={setWorkspaceMenuOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center cursor-pointer transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm p-1">
                      <ChevronsUpDown className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-80">
                    <div className="p-2">
                      <Input
                        placeholder="Search workspace..."
                        value={workspaceSearchQuery}
                        onChange={(e) =>
                          setWorkspaceSearchQuery(e.target.value)
                        }
                        className="h-9"
                      />
                    </div>
                    <DropdownMenuSeparator />
                    <div className="max-h-64 overflow-y-auto">
                      {filteredWorkspaces.map((ws) => (
                        <DropdownMenuItem
                          key={ws.uuid}
                          onClick={() => handleWorkspaceSelect(ws)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <span className="text-sm">{ws.name}</span>
                          {ws.uuid === currentWorkspace?.uuid && (
                            <Check className="w-4 h-4 text-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </div>
                    {hasPlan && (
                      <>
                        <DropdownMenuSeparator />
                        <Dialog
                          open={createWorkspaceOpen}
                          onOpenChange={setCreateWorkspaceOpen}
                        >
                          <DialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                setCreateWorkspaceOpen(true);
                              }}
                              className="cursor-pointer"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              <span>Create workspace</span>
                            </DropdownMenuItem>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Create New Workspace</DialogTitle>
                              <DialogDescription>
                                Create a new workspace to organize your chatbots
                              </DialogDescription>
                            </DialogHeader>
                            <CreateWorkspaceForm
                              onSubmit={handleCreateWorkspace}
                              onCancel={() => setCreateWorkspaceOpen(false)}
                            />
                          </DialogContent>
                        </Dialog>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}

          {/* Chatbot Switcher - Hide for admin users */}
          {!isAdmin && chatbotName && (
            <>
              <span className="hidden size-6 place-content-center justify-center text-center font-medium text-muted-foreground/30 md:inline-flex">
                /
              </span>
            </>
          )}

          {!isAdmin && chatbotName && (
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  chatbotId && router.push(`/chatbot/${chatbotId}/activity`)
                }
                className="flex items-center gap-2 cursor-pointer transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm px-1 py-0.5"
              >
                <span className="text-sm font-medium">{chatbotName}</span>
                <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                  Agent
                </span>
              </button>
              <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center cursor-pointer transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm p-1">
                    <ChevronsUpDown className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-80">
                  <div className="p-2">
                    <Input
                      placeholder="Search Agent..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <DropdownMenuSeparator />
                  <div className="max-h-64 overflow-y-auto">
                    {filteredChatbots.map((bot) => (
                      <DropdownMenuItem
                        key={bot.uuid}
                        onClick={() => handleChatbotSelect(bot.uuid)}
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <span className="text-sm">{bot.name}</span>
                        {bot.uuid === chatbotId && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setIsOpen(false);
                      if (onCreateChatbot) {
                        onCreateChatbot();
                      } else {
                        router.push("/dashboard");
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    <span>Create agent</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bug Report Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setBugReportOpen(true)}
            className="h-8 w-8"
            title="Report a bug"
          >
            <Bug className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                <Avatar className="h-8 w-8 cursor-pointer text-[#de7f02] border border-[#ffe6d6]">
                  <AvatarFallback className="text-xs bg-[#fff8ee] font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{username}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings/profile" className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  <span>Account</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CreditCard className="mr-2 h-4 w-4" />
                <span>Billing</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bell className="mr-2 h-4 w-4" />
                <span>Notifications</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <BugReportSheet open={bugReportOpen} onOpenChange={setBugReportOpen} />
    </header>
  );
}

function CreateWorkspaceForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string, description?: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Workspace name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(name.trim(), description.trim() || undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label htmlFor="workspace-name">Workspace Name</Label>
        <Input
          id="workspace-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Workspace"
          required
          disabled={isSubmitting}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="workspace-description">Description (Optional)</Label>
        <Input
          id="workspace-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Workspace description"
          disabled={isSubmitting}
        />
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create Workspace"}
        </Button>
      </div>
    </form>
  );
}
