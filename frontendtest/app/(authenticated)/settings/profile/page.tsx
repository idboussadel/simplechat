"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Trash2, Loader2, Upload } from "lucide-react";
import { toast } from "react-hot-toast";

interface UserData {
  uuid: string;
  username: string;
  email: string;
  is_active: boolean;
  plan_id: number;
  message_credits_remaining: number;
  credits_reset_date: string;
  subscription_status: string;
  created_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
  });

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const data = await authService.getCurrentUser();
        setUserData(data);
        setFormData({
          username: data.username,
          email: data.email,
        });
      } catch (error) {
        console.error("Failed to fetch user data:", error);
        toast.error("Failed to load profile data");
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [router]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // Don't save if nothing changed
    if (
      formData.username === userData?.username &&
      formData.email === userData?.email
    ) {
      return;
    }

    setSaving(true);

    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        throw new Error("No authentication token");
      }

      const response = await fetch(`${API_URL}/api/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to update profile");
      }

      const updatedData = await response.json();
      setUserData(updatedData);
      toast.success("Profile updated successfully");
    } catch (error: any) {
      console.error("Failed to update profile:", error);
      toast.error(error.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  // Auto-save on blur (when user finishes editing a field)
  const handleBlur = () => {
    handleSubmit();
  };

  const initials =
    userData?.username
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!userData) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* General Section */}
      <form onSubmit={handleSubmit}>
        <div className="rounded-xl border border-border bg-muted/50 p-1 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="space-y-1">
              <h3 className="font-medium text-foreground">General</h3>
              <p className="text-sm text-muted-foreground">
                General settings related to your profile.
              </p>
            </div>
          </div>
          <div className="divide-y divide-border rounded-lg bg-background border shadow-sm">
            {/* Name Field */}
            <div className="flex w-full justify-between p-6 items-start gap-x-20 gap-y-8">
              <label
                htmlFor="username"
                className="font-medium shrink-0 text-foreground max-w-[400px]"
              >
                Name
                <p className="text-[13px] mt-1 font-normal text-muted-foreground">
                  Your full name.
                </p>
              </label>
              <div className="w-[290px] shrink-0">
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  onBlur={handleBlur}
                  placeholder="Enter your name"
                  required
                  minLength={3}
                  maxLength={50}
                  pattern="^[a-zA-Z0-9_-]+$"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="flex w-full justify-between p-6 items-start gap-x-20 gap-y-8">
              <label
                htmlFor="email"
                className="font-medium shrink-0 text-foreground max-w-[400px]"
              >
                Email
                <p className="text-[13px] mt-1 font-normal text-muted-foreground">
                  The email address used for authentication and notifications.
                </p>
              </label>
              <div className="w-[290px] shrink-0">
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  onBlur={handleBlur}
                  placeholder="Enter your email"
                  required
                  disabled={saving}
                />
              </div>
            </div>

            {/* Profile Photo Field */}
            <div className="flex w-full justify-between p-6 items-center gap-x-20 gap-y-8">
              <label
                htmlFor="avatar"
                className="font-medium shrink-0 text-foreground max-w-[400px]"
              >
                Profile photo
                <p className="text-[13px] mt-1 font-normal text-muted-foreground">
                  Used for attribution on deployments and other events.
                </p>
              </label>
              <div className="shrink-0">
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20 shrink-0 text-[#de7f02] border border-[#ffe6d6]">
                    <AvatarFallback className="text-4xl bg-[#fff8ee] font-medium">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <Button type="button" variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload file
                  </Button>
                </div>
                <input
                  id="avatar"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  type="file"
                />
              </div>
            </div>
          </div>
        </div>
        <button type="submit" className="hidden">
          Submit
        </button>
      </form>

      {/* Danger Section */}
      <div className="rounded-xl border border-border bg-muted/50 p-1 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="space-y-1">
            <h3 className="font-medium text-destructive">Danger</h3>
            <p className="text-sm text-muted-foreground">
              Destructive settings that cannot be undone.
            </p>
          </div>
        </div>
        <div className="divide-y divide-border rounded-lg bg-background border shadow-sm">
          <div className="flex w-full justify-between p-6 gap-x-20 gap-y-8 items-end">
            <label className="font-medium shrink-0 text-foreground max-w-[400px]">
              Delete user
              <p className="text-[13px] mt-1 font-normal text-muted-foreground">
                Deleting your user will permanently delete all user data. You
                should download any data that you wish to retain.
              </p>
            </label>
            <div className="flex grow justify-end items-end">
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  toast.error("Delete user functionality not implemented yet");
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete user
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
