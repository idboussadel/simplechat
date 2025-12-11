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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, UserPlus, Mail } from "lucide-react";
import toast from "react-hot-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface User {
  uuid: string;
  username: string;
  email: string;
  user_type: string;
}

interface WorkspaceMember {
  id: number;
  user_uuid: string;
  username: string;
  email: string;
  role: string;
  joined_at: string;
}

export default function MembersPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [isInviting, setIsInviting] = useState(false);

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

        await fetchMembers();
      } catch (error) {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const fetchMembers = async () => {
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
        `${API_URL}/api/workspaces/${workspaceUuid}/members`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      }
    } catch (error) {
      console.error("Failed to fetch members:", error);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Email is required");
      return;
    }

    setIsInviting(true);
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        toast.error("Authentication required");
        return;
      }

      const workspaceUuid = localStorage.getItem("current_workspace_uuid");
      if (!workspaceUuid) {
        toast.error("No workspace selected");
        return;
      }

      const response = await fetch(
        `${API_URL}/api/workspaces/${workspaceUuid}/invitations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            email: inviteEmail.trim(),
            username: inviteUsername.trim() || undefined,
          }),
        }
      );

      if (response.ok) {
        toast.success("Invitation sent successfully!");
        setInviteDialogOpen(false);
        setInviteEmail("");
        setInviteUsername("");
        await fetchMembers();
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to send invitation");
      }
    } catch (error) {
      console.error("Failed to invite member:", error);
      toast.error("Failed to send invitation");
    } finally {
      setIsInviting(false);
    }
  };

  if (loading || !user) {
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
                  <h1 className="text-3xl font-bold tracking-tight">Members</h1>
                  <p className="text-muted-foreground">
                    Manage workspace members and invitations
                  </p>
                </div>
                <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Invite Member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite Member to Workspace</DialogTitle>
                      <DialogDescription>
                        Invite a user to join your workspace. If they don't have an account, one will be created for them.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor="invite-email">Email *</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          placeholder="user@example.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          disabled={isInviting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invite-username">
                          Username (Optional)
                        </Label>
                        <Input
                          id="invite-username"
                          placeholder="username"
                          value={inviteUsername}
                          onChange={(e) => setInviteUsername(e.target.value)}
                          disabled={isInviting}
                        />
                        <p className="text-xs text-muted-foreground">
                          If not provided, a random username will be generated
                        </p>
                      </div>
                      <div className="flex justify-end gap-3 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setInviteDialogOpen(false);
                            setInviteEmail("");
                            setInviteUsername("");
                          }}
                          disabled={isInviting}
                        >
                          Cancel
                        </Button>
                        <Button onClick={handleInvite} disabled={isInviting}>
                          {isInviting ? "Sending..." : "Send Invitation"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Workspace Members</CardTitle>
                  <CardDescription>
                    All members who have access to this workspace
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {members.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No members yet</p>
                      <p className="text-sm mt-2">
                        Invite members to get started
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Joined</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell className="font-medium">
                              {member.username}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                {member.email}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  member.role === "owner"
                                    ? "default"
                                    : member.role === "admin"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {member.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(member.joined_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

