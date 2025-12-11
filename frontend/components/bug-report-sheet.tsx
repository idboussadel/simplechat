"use client";

import { useState, useEffect } from "react";
import { Bug } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "react-hot-toast";
import { authService } from "@/lib/auth";

interface BugReportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Chatbot {
  uuid: string;
  name: string;
}

const PROBLEM_TYPES = [
  "Billing",
  "Account Management",
  "Feature Request",
  "Bugs/Issues",
  "Affiliate Program",
  "Partnership",
  "General Inquiries",
];

const SEVERITY_LEVELS = ["Low", "Medium", "High", "Critical"];

export function BugReportSheet({ open, onOpenChange }: BugReportSheetProps) {
  const [email, setEmail] = useState("");
  const [relatedAccount, setRelatedAccount] = useState("");
  const [relatedAgent, setRelatedAgent] = useState<string>("");
  const [problemType, setProblemType] = useState("General Inquiries");
  const [severity, setSeverity] = useState("Low");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<{
    username: string;
    email: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      // Fetch user data and chatbots when sheet opens
      const fetchData = async () => {
        try {
          const user = await authService.getCurrentUser();
          setUserData({ username: user.username, email: user.email });
          setEmail(user.email);
          setRelatedAccount(`${user.username}'s workspace`);

          // Fetch chatbots
          const API_URL =
            process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
          const token = document.cookie
            .split("; ")
            .find((row) => row.startsWith("access_token="))
            ?.split("=")[1];

          if (token) {
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
          }
        } catch (error) {
          console.error("Failed to fetch data:", error);
        }
      };

      fetchData();
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      toast.error("Please add a description before submitting your request.");
      return;
    }

    setLoading(true);
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

      const response = await fetch(`${API_URL}/api/tickets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          related_account: relatedAccount || null,
          related_agent_uuid: relatedAgent || null,
          problem_type: problemType,
          severity,
          subject: subject.trim() || "No subject",
          description: description.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to submit ticket");
      }

      toast.success("Ticket submitted successfully!");

      // Reset form
      setSubject("");
      setDescription("");
      setRelatedAgent("");
      setProblemType("General Inquiries");
      setSeverity("Low");

      onOpenChange(false);
    } catch (error: any) {
      console.error("Error submitting ticket:", error);
      toast.error(
        error.message || "Failed to submit ticket. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl px-7 py-2 overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-2xl font-bold">
            Submit a case to our Customer Support Team
          </SheetTitle>
          <SheetDescription>
            Please fill out the form below and we'll get back to you as soon as
            possible.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled
              required
            />
          </div>

          {/* Related Account */}
          <div className="space-y-2">
            <Label htmlFor="relatedAccount">Related Account</Label>
            <Input
              id="relatedAccount"
              value={relatedAccount}
              onChange={(e) => setRelatedAccount(e.target.value)}
            />
          </div>

          {/* Related Agents */}
          <div className="space-y-2">
            <Label htmlFor="relatedAgent">Related Agents</Label>
            <Select
              value={relatedAgent || undefined}
              onValueChange={(value) => setRelatedAgent(value || "")}
            >
              <SelectTrigger id="relatedAgent">
                <SelectValue placeholder="Select an agent..." />
              </SelectTrigger>
              <SelectContent>
                {chatbots.length > 0 ? (
                  chatbots.map((bot) => (
                    <SelectItem key={bot.uuid} value={bot.uuid}>
                      {bot.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-agents" disabled>
                    No agents available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Problem Type and Severity in same row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="problemType">Selected Problem</Label>
              <Select value={problemType} onValueChange={setProblemType}>
                <SelectTrigger id="problemType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROBLEM_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">Selected Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger id="severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of your issue"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please include all information relevant to your issue."
              className="min-h-[150px] resize-none"
              required
            />
            <p
              className={`text-sm ${
                !description.trim()
                  ? "text-muted-foreground"
                  : "text-muted-foreground opacity-70"
              }`}
            >
              Please add a description before submitting your request.
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={loading || !description.trim()}>
              {loading ? "Submitting..." : "Submit Ticket"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
