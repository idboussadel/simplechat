"use client";

import { useState, useEffect, use, useMemo, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { parseISO } from "date-fns";

// Helper function to parse dates as UTC (handles both ISO strings with/without timezone)
// Backend sends dates in UTC but may not include timezone info (e.g., "2025-11-27 17:15:02.344484")
function parseDateAsUTC(dateString: string): Date {
  if (!dateString) return new Date();

  // Check if date string has timezone info (ends with Z, +, or has timezone offset)
  const hasTimezone =
    dateString.endsWith("Z") ||
    /[+-]\d{2}:?\d{2}$/.test(dateString) ||
    (dateString.includes("T") &&
      (dateString.includes("+") || dateString.includes("-", 10)));

  if (!hasTimezone) {
    // Naive datetime from backend (assumed UTC) - convert to ISO format with Z
    // Handle formats like "2025-11-27 17:15:02.344484" or "2025-11-27T17:15:02.344484"
    const normalized = dateString.replace(" ", "T");
    return parseISO(normalized + "Z");
  }

  // Already has timezone info, parse normally
  return parseISO(dateString);
}

// Strip markdown formatting to get plain text
function stripMarkdown(text: string): string {
  if (!text) return "";

  // Remove markdown bold **text** -> text
  let plain = text.replace(/\*\*(.+?)\*\*/g, "$1");

  // Remove markdown italic *text* -> text
  plain = plain.replace(/\*(.+?)\*/g, "$1");

  // Remove markdown code `code` -> code
  plain = plain.replace(/`(.+?)`/g, "$1");

  // Remove markdown links [text](url) -> text
  plain = plain.replace(/\[(.+?)\]\(.+?\)/g, "$1");

  // Remove markdown headers # -> empty
  plain = plain.replace(/^#+\s+/gm, "");

  // Remove markdown bullets - or * at start of line
  plain = plain.replace(/^[-*]\s+/gm, "");

  // Remove HTML tags if any
  plain = plain.replace(/<[^>]*>/g, "");

  // Decode HTML entities
  plain = plain
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return plain.trim();
}

// Simple markdown renderer for messages
function renderMarkdown(text: string): string {
  if (!text) return "";

  // Escape HTML first to prevent XSS
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Convert markdown links [text](url) to <a> tags
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">$1</a>'
  );

  // Convert markdown bold **text** to <strong>text</strong>
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Convert markdown bullets (- or *) to HTML list
  const lines = html.split("\n");
  const processedLines: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isBullet = /^[-*]\s+/.test(line);

    if (isBullet) {
      if (!inList) {
        processedLines.push("<ul>");
        inList = true;
      }
      const listItem = line.replace(/^[-*]\s+/, "");
      processedLines.push(`<li>${listItem}</li>`);
    } else {
      if (inList) {
        processedLines.push("</ul>");
        inList = false;
      }
      if (line) {
        processedLines.push(`<p>${line}</p>`);
      } else {
        processedLines.push("<br>");
      }
    }
  }

  if (inList) {
    processedLines.push("</ul>");
  }

  return processedLines.join("");
}
import {
  Search,
  Download,
  Filter,
  MoreVertical,
  User,
  UserCheck,
  AlertCircle,
  MessageSquare,
  Send,
  Mail,
  Phone,
  Calendar,
  UserPlus,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "react-hot-toast";
import { authService } from "@/lib/auth";

interface Conversation {
  uuid: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  status: string;
  handoff_status?: string;
  assigned_to_user_uuid?: string;
  created_at: string;
  updated_at: string;
  last_message?: string;
  last_user_message?: string;
}

interface Message {
  id: number;
  role: string;
  content: string;
  feedback?: string | null;
  created_at: string;
}

interface HandoffRequest {
  id: number;
  conversation_uuid: string;
  chatbot_uuid: string;
  status: string;
  requested_at: string;
  accepted_at?: string;
  accepted_by_user_uuid?: string;
  resolved_at?: string;
  reason?: string;
  customer_name?: string;
  customer_email?: string;
  last_message?: string;
}

interface ActivityPageProps {
  params: Promise<{ id: string }>;
}

export default function ActivityPage({ params }: ActivityPageProps) {
  const { id: chatbotId } = use(params);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [handoffRequests, setHandoffRequests] = useState<HandoffRequest[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [activeTab, setActiveTab] = useState<"requests" | "chats">("requests");
  const [messageInput, setMessageInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ uuid: string } | null>(null);
  const [showOnlyMyChats, setShowOnlyMyChats] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [isChatbotGenerating, setIsChatbotGenerating] = useState(false);
  const [assignedUser, setAssignedUser] = useState<{ username: string } | null>(
    null
  );
  const [timestampUpdate, setTimestampUpdate] = useState(0); // Force timestamp updates
  const wsRef = useRef<WebSocket | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authService.getCurrentUser();
        setCurrentUser({ uuid: userData.uuid });
      } catch (error) {
        console.error("Failed to fetch user:", error);
      }
    };

    fetchUser();
    fetchConversations(true); // Reset on initial load
    fetchHandoffRequests();

    // Only poll handoff requests (keep polling for requests)
    const interval = setInterval(() => {
      fetchHandoffRequests();
    }, 10000);
    return () => clearInterval(interval);
  }, [chatbotId]);

  // WebSocket connection for real-time dashboard monitoring (like WhatsApp)
  useEffect(() => {
    if (!chatbotId) return;

    // Prevent multiple connections
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        return; // Already connected
      }
      // Clean up existing connection if it's in a bad state
      if (wsRef.current.readyState !== WebSocket.CONNECTING) {
        try {
          wsRef.current.close();
        } catch (e) {
          // Ignore errors when closing
        }
        wsRef.current = null;
      }
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const wsProtocol = API_URL.startsWith("https://") ? "wss" : "ws";
    const wsHost = API_URL.replace(/^https?:\/\//, "");
    const dashboardSessionId = `dashboard_${chatbotId}_${Date.now()}`;
    const wsUrl = `${wsProtocol}://${wsHost}/api/chat/ws/${chatbotId}?session_id=${dashboardSessionId}`;

    let ws: WebSocket | null = null;
    let isIntentionallyClosed = false;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[Dashboard] WebSocket connected for real-time monitoring");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Ignore connection confirmation
          if (data.type === "connection" || data.type === "pong") {
            return;
          }

          // Handle real-time updates (like WhatsApp)
          if (data.type === "conversation_created") {
            console.log(
              "[Dashboard] New conversation created, refreshing list"
            );
            fetchConversations(true); // Reset to show new conversation at top
          } else if (data.type === "new_message") {
            console.log("[Dashboard] New message received, refreshing");
            // Refresh conversations to update last_message (reset to get updated order)
            fetchConversations(true);
            // If message is for selected conversation, refresh messages
            if (
              selectedConversation &&
              data.conversation_uuid === selectedConversation.uuid
            ) {
              fetchMessages(selectedConversation.uuid);
            }
          }
        } catch (error) {
          console.error("[Dashboard] Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        // Only log if connection is not intentionally closed
        // WebSocket errors are often just connection issues, not critical
        if (!isIntentionallyClosed && ws?.readyState !== WebSocket.CLOSING) {
          // Silently handle - connection will be cleaned up in onclose
        }
      };

      ws.onclose = (event) => {
        // Only log if not intentionally closed
        if (!isIntentionallyClosed) {
          // Normal closure codes: 1000 (normal), 1001 (going away), 1006 (abnormal - often from React Strict Mode)
          if (event.code === 1000 || event.code === 1001) {
            console.log("[Dashboard] WebSocket closed normally");
          } else if (event.code === 1006) {
            // This often happens in React Strict Mode during development
            // It's not a real error, just the connection being closed during remount
            console.log(
              "[Dashboard] WebSocket closed (likely React Strict Mode)"
            );
          } else {
            console.log(
              "[Dashboard] WebSocket disconnected",
              event.code,
              event.reason
            );
          }
        }
        wsRef.current = null;
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("[Dashboard] Failed to create WebSocket:", error);
      wsRef.current = null;
    }

    return () => {
      isIntentionallyClosed = true;
      if (wsRef.current) {
        try {
          // Only close if connection is open or connecting
          if (
            wsRef.current.readyState === WebSocket.OPEN ||
            wsRef.current.readyState === WebSocket.CONNECTING
          ) {
            wsRef.current.close(1000, "Component unmounting");
          }
        } catch (e) {
          // Ignore errors when closing
        }
        wsRef.current = null;
      }
    };
  }, [chatbotId]);

  // Infinite scroll: Load more conversations when scrolling near bottom
  useEffect(() => {
    if (activeTab !== "chats" || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry.isIntersecting && hasMore && !loadingMore) {
          setLoadingMore(true);
          fetchConversations(false).finally(() => {
            setLoadingMore(false);
          });
        }
      },
      {
        root: null,
        rootMargin: "100px", // Start loading 100px before reaching the element
        threshold: 0.1,
      }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
      observer.disconnect();
    };
  }, [hasMore, loadingMore, activeTab, chatbotId, offset]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.uuid);

      // Fetch assigned user info if conversation is taken over
      if (selectedConversation.assigned_to_user_uuid) {
        fetchAssignedUser(selectedConversation.assigned_to_user_uuid);
      } else {
        setAssignedUser(null);
      }

      // Refresh messages every 10 seconds if in human mode (reduced frequency)
      if (selectedConversation.handoff_status === "human") {
        const interval = setInterval(() => {
          fetchMessages(selectedConversation.uuid);
        }, 10000);
        return () => clearInterval(interval);
      }
    } else {
      setAssignedUser(null);
    }
  }, [selectedConversation]);

  // Update message timestamps dynamically every 30 seconds
  useEffect(() => {
    if (!selectedConversation || messages.length === 0) return;

    const interval = setInterval(() => {
      // Update timestamp trigger to force re-render of time displays
      setTimestampUpdate(Date.now());
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [selectedConversation, messages.length]);

  const fetchAssignedUser = async (userUuid: string) => {
    try {
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        console.error("No token found");
        return;
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/api/auth/user/${userUuid}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (response.ok) {
        const userData = await response.json();
        setAssignedUser({ username: userData.username });
      } else {
        setAssignedUser(null);
      }
    } catch (error) {
      console.error("Error fetching assigned user:", error);
      setAssignedUser(null);
    }
  };

  // Refresh selected conversation data periodically to get updated handoff_status
  // Only refresh if conversation is in human mode (to reduce unnecessary polling)
  useEffect(() => {
    if (
      selectedConversation &&
      currentUser &&
      selectedConversation.handoff_status === "human"
    ) {
      const interval = setInterval(async () => {
        const token = document.cookie
          .split("; ")
          .find((row) => row.startsWith("access_token="))
          ?.split("=")[1];

        if (token && selectedConversation) {
          // Refresh only the selected conversation's data
          // Fetch just the first page to get updated conversation data
          try {
            const API_URL =
              process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            const response = await fetch(
              `${API_URL}/api/chat/${chatbotId}/conversations?limit=20&offset=0`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
                credentials: "include",
              }
            );

            if (response.ok) {
              const data = await response.json();
              if (data.conversations) {
                const updated = data.conversations.find(
                  (c: Conversation) => c.uuid === selectedConversation.uuid
                );
                if (updated) {
                  setSelectedConversation(updated);
                  // Update in current conversations list if it exists there
                  setConversations((prev) =>
                    prev.map((c) => (c.uuid === updated.uuid ? updated : c))
                  );
                }
              }
            }
          } catch (error) {
            console.error("Error refreshing conversation:", error);
          }
        }
      }, 10000); // Refresh every 10 seconds (reduced frequency)

      return () => clearInterval(interval);
    }
  }, [
    selectedConversation?.uuid,
    currentUser?.uuid,
    chatbotId,
    selectedConversation?.handoff_status,
  ]);

  const fetchConversations = async (reset: boolean = false) => {
    try {
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        console.error("No token found");
        setLoading(false);
        return;
      }

      // Reset state if needed
      if (reset) {
        setOffset(0);
        setHasMore(true);
      }

      const currentOffset = reset ? 0 : offset;
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(
        `${API_URL}/api/chat/${chatbotId}/conversations?limit=10&offset=${currentOffset}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch conversations");
      }

      const data = await response.json();

      // Handle paginated response
      if (data.conversations && Array.isArray(data.conversations)) {
        if (reset) {
          setConversations(data.conversations);
          setOffset(data.conversations.length);
          // Auto-select first conversation if none selected
          if (data.conversations.length > 0 && !selectedConversation) {
            setSelectedConversation(data.conversations[0]);
          }
        } else {
          setConversations((prev) => [...prev, ...data.conversations]);
          setOffset((prev) => prev + data.conversations.length);
        }

        setHasMore(data.has_more || false);

        // Update selected conversation if it exists in the new data
        if (selectedConversation) {
          const allConversations = reset
            ? data.conversations
            : [...conversations, ...data.conversations];
          const updated = allConversations.find(
            (conv: any) => conv.uuid === selectedConversation.uuid
          );
          if (updated) {
            setSelectedConversation(updated);
          }
        }
      } else {
        console.error("Expected paginated response but got:", data);
        if (reset) {
          setConversations([]);
          setOffset(0);
          setHasMore(false);
        }
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId: string): Promise<Message[]> => {
    try {
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        console.error("No token found");
        return [];
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(
        `${API_URL}/api/chat/conversations/${conversationId}/messages`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }

      const data = await response.json();

      // Ensure data is an array
      if (Array.isArray(data)) {
        setMessages(data);
        return data;
      } else {
        console.error("Expected array but got:", data);
        setMessages([]);
        return [];
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      setMessages([]);
      return [];
    }
  };

  const fetchHandoffRequests = async () => {
    try {
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        console.log("[Handoff] No token found");
        return;
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      console.log(
        `[Handoff] Fetching from ${API_URL}/api/handoff/pending/${chatbotId}`
      );
      const response = await fetch(
        `${API_URL}/api/handoff/pending/${chatbotId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.log("[Handoff] Chatbot not found or no access");
          setHandoffRequests([]);
          return;
        }
        const errorText = await response.text();
        console.error(
          `[Handoff] Failed to fetch: ${response.status} - ${errorText}`
        );
        throw new Error("Failed to fetch handoff requests");
      }

      const data = await response.json();
      console.log(
        `[Handoff] Received ${data?.length || 0} handoff requests:`,
        data
      );
      setHandoffRequests(data || []);
    } catch (error) {
      console.error("[Handoff] Error fetching handoff requests:", error);
      // Don't clear on error, keep existing data
    }
  };

  const acceptHandoffRequest = async (handoffRequestId: number) => {
    try {
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        toast.error("Authentication required");
        return;
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/api/handoff/accept`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ handoff_request_id: handoffRequestId }),
      });

      if (!response.ok) {
        throw new Error("Failed to accept handoff request");
      }

      const handoffData = await response.json();
      toast.success("Handoff request accepted");

      // Get the handoff request before refreshing
      const handoff = handoffRequests.find((r) => r.id === handoffRequestId);
      const conversationUuid =
        handoff?.conversation_uuid || handoffData?.conversation_uuid;

      if (!conversationUuid || !currentUser) {
        console.error("[Handoff] Missing conversation UUID or current user");
        return;
      }

      // Switch to chats tab immediately
      setActiveTab("chats");

      // Refresh data
      await fetchHandoffRequests();

      // Fetch updated conversations immediately
      const refreshToken = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (refreshToken) {
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const convResponse = await fetch(
          `${API_URL}/api/chat/${chatbotId}/conversations`,
          {
            headers: {
              Authorization: `Bearer ${refreshToken}`,
            },
            credentials: "include",
          }
        );

        if (convResponse.ok) {
          const allConversations = await convResponse.json();
          const updatedConversation = allConversations.find(
            (c: Conversation) => c.uuid === conversationUuid
          );

          if (updatedConversation) {
            // Ensure the conversation has the correct handoff status and assignment
            const finalConversation = {
              ...updatedConversation,
              handoff_status: updatedConversation.handoff_status || "human",
              assigned_to_user_uuid:
                updatedConversation.assigned_to_user_uuid || currentUser.uuid,
            };

            // Update the conversation in the list
            const updatedList = allConversations.map((c: Conversation) =>
              c.uuid === conversationUuid ? finalConversation : c
            );
            setConversations(updatedList);

            // Update the selected conversation with the fresh data
            setSelectedConversation(finalConversation);
            console.log("[Handoff] Conversation updated:", finalConversation);
          } else if (
            selectedConversation &&
            selectedConversation.uuid === conversationUuid
          ) {
            // If conversation not found in list, update the selected one directly
            const newConversation: Conversation = {
              ...selectedConversation,
              handoff_status: "human",
              assigned_to_user_uuid: currentUser.uuid,
            };
            setSelectedConversation(newConversation);
            console.log(
              "[Handoff] Updated selected conversation:",
              newConversation
            );
          }
        }
      }

      // Also call fetchConversations to ensure state is synced
      await fetchConversations(true);
    } catch (error) {
      console.error("Error accepting handoff request:", error);
      toast.error("Failed to accept handoff request");
    }
  };

  // Check if chatbot is currently generating a response
  const checkIfChatbotGenerating = (messagesToCheck?: Message[]): boolean => {
    const msgs = messagesToCheck || messages;
    if (!msgs || msgs.length === 0) return false;

    const lastMessage = msgs[msgs.length - 1];

    // If last message is from user, chatbot is definitely not generating
    if (lastMessage.role === "user") return false;

    // If last message is from agent (human), chatbot is not generating
    if (lastMessage.role === "agent") return false;

    // Only check if last message is from assistant
    if (lastMessage.role !== "assistant") return false;

    // Check if last assistant message was created within the last 10 seconds
    // (reduced from 30 to be more accurate - if message is older than 10 seconds, chatbot is done)
    const messageDate = parseDateAsUTC(lastMessage.created_at);
    const now = new Date();
    const diffInSeconds = (now.getTime() - messageDate.getTime()) / 1000;

    // Only consider it generating if message is very recent (less than 10 seconds old)
    // This is more accurate - if the message is older, the chatbot has definitely finished
    return diffInSeconds >= 0 && diffInSeconds < 10;
  };

  const takeOverConversation = async () => {
    if (!selectedConversation || takingOver) return;

    setTakingOver(true);

    try {
      // First, fetch latest messages to check current state
      const latestMessages = await fetchMessages(selectedConversation.uuid);

      // Check if chatbot is generating using the fetched messages
      const chatbotGenerating = checkIfChatbotGenerating(latestMessages);
      console.log("[TakeOver] Initial check:", {
        chatbotGenerating,
        lastMessage: latestMessages[latestMessages.length - 1],
        messageAge:
          latestMessages.length > 0
            ? (new Date().getTime() -
                parseDateAsUTC(
                  latestMessages[latestMessages.length - 1].created_at
                ).getTime()) /
              1000
            : "N/A",
      });

      if (chatbotGenerating) {
        setIsChatbotGenerating(true);

        // Wait for chatbot to finish generating
        // Poll messages every 2 seconds until chatbot finishes (no new assistant message in last 10 seconds)
        let pollCount = 0;
        const maxPolls = 15; // 15 polls * 2 seconds = 30 seconds max (reduced since we check 10 seconds)
        let pollInterval: NodeJS.Timeout | null = null;

        pollInterval = setInterval(async () => {
          try {
            pollCount++;
            const updatedMessages = await fetchMessages(
              selectedConversation.uuid
            );

            const stillGenerating = checkIfChatbotGenerating(updatedMessages);
            console.log("[TakeOver] Poll check:", {
              pollCount,
              stillGenerating,
              lastMessage: updatedMessages[updatedMessages.length - 1],
              messageAge:
                updatedMessages.length > 0
                  ? (new Date().getTime() -
                      parseDateAsUTC(
                        updatedMessages[updatedMessages.length - 1].created_at
                      ).getTime()) /
                    1000
                  : "N/A",
            });

            if (!stillGenerating || pollCount >= maxPolls) {
              if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
              }
              setIsChatbotGenerating(false);
              // Now proceed with takeover
              await proceedWithTakeover();
            }
          } catch (error) {
            console.error("[TakeOver] Error in polling:", error);
            // On error, proceed anyway to avoid infinite loop
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
            setIsChatbotGenerating(false);
            await proceedWithTakeover();
          }
        }, 2000);

        // Safety timeout - always proceed after 35 seconds even if still "generating"
        setTimeout(() => {
          if (pollInterval) {
            console.log("[TakeOver] Safety timeout - proceeding anyway");
            clearInterval(pollInterval);
            pollInterval = null;
            setIsChatbotGenerating(false);
            proceedWithTakeover();
          }
        }, 35000);

        return;
      }

      // If not generating, proceed immediately
      await proceedWithTakeover();
    } catch (error) {
      setTakingOver(false);
      setIsChatbotGenerating(false);
      console.error("Error in takeOverConversation:", error);
    }
  };

  const proceedWithTakeover = async () => {
    if (!selectedConversation) {
      setTakingOver(false);
      setIsChatbotGenerating(false);
      return;
    }

    try {
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        throw new Error("No authentication token");
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/api/handoff/takeover`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          conversation_uuid: selectedConversation.uuid,
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: "Failed to take over conversation" }));
        throw new Error(errorData.detail || "Failed to take over conversation");
      }

      // Refresh conversations and messages to reflect the change
      await fetchConversations(true);
      await fetchMessages(selectedConversation.uuid);
      toast.success("Conversation taken over successfully");
    } catch (error: any) {
      console.error("Error taking over conversation:", error);
      toast.error(
        error.message || "Failed to take over conversation. Please try again."
      );
    } finally {
      setTakingOver(false);
      setIsChatbotGenerating(false);
    }
  };

  const sendAgentMessage = async () => {
    if (!messageInput.trim() || !selectedConversation) {
      return;
    }

    setSendingMessage(true);
    try {
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        toast.error("Authentication required");
        return;
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/api/handoff/message`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          conversation_uuid: selectedConversation.uuid,
          content: messageInput.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: "Failed to send message" }));
        throw new Error(errorData.detail || "Failed to send message");
      }

      setMessageInput("");
      await fetchMessages(selectedConversation.uuid);
      toast.success("Message sent");
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error(
        error.message ||
          "Failed to send message. Make sure you're assigned to this conversation."
      );
    } finally {
      setSendingMessage(false);
    }
  };

  // Get conversations for pending handoff requests
  const pendingHandoffConversations = useMemo(() => {
    if (!Array.isArray(conversations) || handoffRequests.length === 0) {
      return [];
    }
    const pendingUuids = new Set(
      handoffRequests.map((r) => r.conversation_uuid)
    );
    return conversations.filter((conv) => pendingUuids.has(conv.uuid));
  }, [conversations, handoffRequests]);

  // Filter conversations based on active tab and filter switch
  const filteredConversations = Array.isArray(conversations)
    ? conversations
        .filter((conv) => {
          // In "chats" tab, filter based on switch
          if (activeTab === "chats") {
            if (showOnlyMyChats) {
              // Show only conversations assigned to current user
              if (!currentUser) return false;
              return (
                conv.assigned_to_user_uuid === currentUser.uuid &&
                conv.handoff_status === "human"
              );
            } else {
              // Show all conversations
              return true;
            }
          }
          // In "requests" tab, show all conversations (for reference)
          return true;
        })
        .filter(
          (conv) =>
            conv.last_message
              ?.toLowerCase()
              .includes(searchQuery.toLowerCase()) ||
            conv.last_user_message
              ?.toLowerCase()
              .includes(searchQuery.toLowerCase()) ||
            conv.customer_name
              ?.toLowerCase()
              .includes(searchQuery.toLowerCase()) ||
            conv.customer_email
              ?.toLowerCase()
              .includes(searchQuery.toLowerCase())
        )
    : [];

  // Filter pending handoff conversations by search query
  const filteredPendingHandoffs = pendingHandoffConversations.filter(
    (conv) =>
      conv.last_message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.last_user_message
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      conv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.customer_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Check if selected conversation has a pending handoff request
  const selectedHandoffRequest = selectedConversation
    ? handoffRequests.find(
        (r) => r.conversation_uuid === selectedConversation.uuid
      )
    : null;

  // Clear selected conversation when switching tabs if it's not relevant
  useEffect(() => {
    if (!selectedConversation) return;

    if (activeTab === "requests") {
      // On requests tab, only show conversations with pending handoffs
      const hasPendingHandoff = handoffRequests.some(
        (r) =>
          r.conversation_uuid === selectedConversation.uuid &&
          r.status === "pending"
      );
      if (!hasPendingHandoff) {
        setSelectedConversation(null);
        setMessages([]);
      }
    } else if (activeTab === "chats") {
      // On chats tab, only show conversations that are in the filtered list
      const isInFilteredList = filteredConversations.some(
        (c) => c.uuid === selectedConversation.uuid
      );
      if (!isInFilteredList) {
        setSelectedConversation(null);
        setMessages([]);
      }
    }
  }, [
    activeTab,
    handoffRequests,
    filteredConversations,
    selectedConversation?.uuid,
  ]);

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* Sidebar */}
      <div className="w-110 border-r flex flex-col min-h-0">
        <div className="p-4 border-b shrink-0">
          <div className="flex gap-2 mb-3">
            <Button
              variant={activeTab === "requests" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setActiveTab("requests");
                // Clear selected conversation if it doesn't have a pending handoff
                if (selectedConversation) {
                  const hasPendingHandoff = handoffRequests.some(
                    (r) =>
                      r.conversation_uuid === selectedConversation.uuid &&
                      r.status === "pending"
                  );
                  if (!hasPendingHandoff) {
                    setSelectedConversation(null);
                    setMessages([]);
                  }
                }
              }}
              className="flex-1"
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Requests
              {(() => {
                // Count requests created within the last hour
                const newRequestsCount = handoffRequests.filter((request) => {
                  const requestedAt = parseDateAsUTC(request.requested_at);
                  const now = new Date();
                  const diffInMs = now.getTime() - requestedAt.getTime();
                  const diffInHours = diffInMs / (1000 * 60 * 60);
                  return diffInHours < 1;
                }).length;
                return newRequestsCount > 0 ? (
                  <Badge variant="destructive" className="ml-2">
                    {newRequestsCount}
                  </Badge>
                ) : null;
              })()}
            </Button>
            <Button
              variant={activeTab === "chats" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setActiveTab("chats");
                // Clear selected conversation if it's not in the chats list
                if (selectedConversation) {
                  const isInChats = conversations.some(
                    (c) => c.uuid === selectedConversation.uuid
                  );
                  if (!isInChats) {
                    setSelectedConversation(null);
                    setMessages([]);
                  }
                }
              }}
              className="flex-1"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Chats
            </Button>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filter switch for Chats tab */}
            {activeTab === "chats" && (
              <div className="flex items-center gap-2">
                <Switch
                  id="my-chats-filter"
                  checked={showOnlyMyChats}
                  onCheckedChange={setShowOnlyMyChats}
                  className="data-[state=checked]:bg-primary"
                />
                <Label
                  htmlFor="my-chats-filter"
                  className="text-xs text-muted-foreground cursor-pointer font-normal"
                >
                  Only my chats
                </Label>
              </div>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading...
            </div>
          ) : activeTab === "requests" ? (
            filteredPendingHandoffs.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No pending handoff requests
              </div>
            ) : (
              <div className="divide-y">
                {filteredPendingHandoffs.map((conversation) => {
                  const request = handoffRequests.find(
                    (r) => r.conversation_uuid === conversation.uuid
                  );

                  // Check if request was created within the last hour
                  const isNew = request
                    ? (() => {
                        const requestedAt = parseDateAsUTC(
                          request.requested_at
                        );
                        const now = new Date();
                        const diffInMs = now.getTime() - requestedAt.getTime();
                        const diffInHours = diffInMs / (1000 * 60 * 60);
                        return diffInHours < 1;
                      })()
                    : false;

                  return (
                    <div
                      key={`pending-${conversation.uuid}`}
                      className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                        selectedConversation?.uuid === conversation.uuid
                          ? "bg-muted"
                          : ""
                      }`}
                      onClick={() => setSelectedConversation(conversation)}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="font-medium text-sm line-clamp-1 flex-1">
                          {conversation.last_message
                            ? (() => {
                                const plainText = stripMarkdown(
                                  conversation.last_message
                                );
                                return plainText.length > 50
                                  ? plainText.substring(0, 50) + "..."
                                  : plainText;
                              })()
                            : "No messages"}
                        </div>
                        {isNew && (
                          <Badge
                            variant="secondary"
                            className="ml-2 text-xs shrink-0 bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-300 font-medium"
                          >
                            New
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-1">
                        {conversation.last_user_message
                          ? conversation.last_user_message.length > 60
                            ? conversation.last_user_message.substring(0, 60) +
                              "..."
                            : conversation.last_user_message
                          : "No user message"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(
                          parseDateAsUTC(conversation.updated_at),
                          {
                            addSuffix: true,
                          }
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              {activeTab === "chats"
                ? showOnlyMyChats
                  ? "No active conversations assigned to you"
                  : "No conversations yet"
                : "No conversations yet"}
            </div>
          ) : (
            <div className="divide-y">
              {filteredConversations.map((conversation) => (
                <div
                  key={`conversation-${conversation.uuid}`}
                  className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedConversation?.uuid === conversation.uuid
                      ? "bg-muted"
                      : ""
                  }`}
                  onClick={() => setSelectedConversation(conversation)}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="font-medium text-sm line-clamp-1 flex-1">
                      {conversation.last_message
                        ? (() => {
                            const plainText = stripMarkdown(
                              conversation.last_message
                            );
                            return plainText.length > 50
                              ? plainText.substring(0, 50) + "..."
                              : plainText;
                          })()
                        : "No messages"}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(
                          parseDateAsUTC(conversation.updated_at),
                          {
                            addSuffix: false,
                          }
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {conversation.last_user_message
                      ? conversation.last_user_message.length > 60
                        ? conversation.last_user_message.substring(0, 60) +
                          "..."
                        : conversation.last_user_message
                      : "No user message"}
                  </div>
                </div>
              ))}
              {/* Infinite scroll trigger */}
              {hasMore && (
                <div
                  ref={loadMoreRef}
                  className="p-4 text-center text-muted-foreground text-sm"
                >
                  {loadingMore ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading more conversations...</span>
                    </div>
                  ) : (
                    <span>Scroll for more</span>
                  )}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Conversation Details */}
      <div className="flex-1 flex">
        {selectedConversation ? (
          <>
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between shrink-0">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">
                      {selectedConversation.customer_name}
                    </h3>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedConversation.customer_email}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedConversation.handoff_status !== "human" ||
                  selectedConversation.assigned_to_user_uuid !==
                    currentUser?.uuid ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={takeOverConversation}
                      disabled={takingOver}
                      className="flex items-center gap-2"
                    >
                      {takingOver ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {isChatbotGenerating
                            ? "Waiting for chatbot..."
                            : "Taking over..."}
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" />
                          Take Over
                        </>
                      )}
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="icon">
                    <Download className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Archive conversation</DropdownMenuItem>
                      <DropdownMenuItem>Export messages</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">
                        Delete conversation
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-6">
                  <div className="max-w-3xl mx-auto space-y-6">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`${
                          message.role === "user"
                            ? "flex justify-end"
                            : message.role === "agent"
                            ? "flex justify-start"
                            : "flex justify-start"
                        }`}
                      >
                        {message.role === "user" ? (
                          <div className="flex flex-col items-end max-w-[75%]">
                            <div className="bg-black text-white rounded-2xl px-4 py-3 max-w-full shadow-sm [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:my-1 [&_li]:leading-relaxed [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold">
                              <div
                                className="text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{
                                  __html: renderMarkdown(message.content),
                                }}
                              />
                            </div>
                          </div>
                        ) : message.role === "agent" ? (
                          <div className="flex flex-col items-start max-w-[75%]">
                            <div className="bg-blue-500 text-white rounded-2xl px-4 py-3 max-w-full shadow-sm [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:my-1 [&_li]:leading-relaxed [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold">
                              <div className="flex items-center gap-2 mb-2">
                                <User className="w-4 h-4" />
                                <span className="font-semibold text-xs">
                                  Agent
                                </span>
                              </div>
                              <div
                                className="text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{
                                  __html: renderMarkdown(message.content),
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-start max-w-[75%] w-full">
                            <div className="bg-gray-50 rounded-2xl px-4 py-3 max-w-full shadow-sm border border-gray-100">
                              <div className="flex items-center gap-2 mb-2">
                                <img
                                  src="/chat-logo.png"
                                  alt="Bot"
                                  className="w-5 h-5 rounded-full object-cover"
                                />
                                <span className="font-semibold text-sm text-gray-900">
                                  AI Agent
                                </span>
                              </div>
                              <div className="text-sm leading-relaxed text-gray-700 [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:my-1 [&_li]:leading-relaxed [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold">
                                <div
                                  dangerouslySetInnerHTML={{
                                    __html: renderMarkdown(message.content),
                                  }}
                                />
                              </div>
                              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                                <span
                                  className="text-xs text-gray-500"
                                  key={timestampUpdate}
                                >
                                  {formatDistanceToNow(
                                    parseDateAsUTC(message.created_at),
                                    { addSuffix: true }
                                  )}
                                </span>
                                <div className="flex items-center gap-3">
                                  {/* Copy button */}
                                  <button
                                    onClick={async () => {
                                      try {
                                        const tempDiv =
                                          document.createElement("div");
                                        tempDiv.innerHTML = renderMarkdown(
                                          message.content
                                        );
                                        const plainText =
                                          tempDiv.textContent ||
                                          tempDiv.innerText ||
                                          message.content;

                                        await navigator.clipboard.writeText(
                                          plainText
                                        );
                                        toast.success(
                                          "Message copied to clipboard"
                                        );
                                      } catch (error) {
                                        console.error("Failed to copy:", error);
                                        try {
                                          const tempDiv =
                                            document.createElement("div");
                                          tempDiv.innerHTML = renderMarkdown(
                                            message.content
                                          );
                                          const plainText =
                                            tempDiv.textContent ||
                                            tempDiv.innerText ||
                                            message.content;

                                          const textArea =
                                            document.createElement("textarea");
                                          textArea.value = plainText;
                                          textArea.style.position = "fixed";
                                          textArea.style.opacity = "0";
                                          document.body.appendChild(textArea);
                                          textArea.select();
                                          document.execCommand("copy");
                                          document.body.removeChild(textArea);
                                          toast.success(
                                            "Message copied to clipboard"
                                          );
                                        } catch (fallbackError) {
                                          console.error(
                                            "Fallback copy failed:",
                                            fallbackError
                                          );
                                          toast.error("Failed to copy message");
                                        }
                                      }
                                    }}
                                    className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 transition-colors cursor-pointer text-gray-500 hover:text-gray-700"
                                    title="Copy message"
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <rect
                                        x="9"
                                        y="9"
                                        width="13"
                                        height="13"
                                        rx="2"
                                        ry="2"
                                      />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                  </button>
                                  {/* Thumbs up */}
                                  <button
                                    className={`flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 transition-colors ${
                                      message.feedback === "like"
                                        ? "text-green-600 bg-green-50"
                                        : "text-gray-500"
                                    }`}
                                    title="Like"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M7 10v12" />
                                      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
                                    </svg>
                                  </button>
                                  {/* Thumbs down */}
                                  <button
                                    className={`flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 transition-colors ${
                                      message.feedback === "dislike"
                                        ? "text-red-600 bg-red-50"
                                        : "text-gray-500"
                                    }`}
                                    title="Dislike"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M17 14V2" />
                                      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>

              {/* Take Over Button - Show if viewing a pending handoff request */}
              {selectedConversation &&
                activeTab === "requests" &&
                selectedHandoffRequest &&
                selectedHandoffRequest.status === "pending" && (
                  <div className="p-4 border-t">
                    <Button
                      onClick={() =>
                        acceptHandoffRequest(selectedHandoffRequest.id)
                      }
                      className="w-full"
                      size="lg"
                    >
                      <UserCheck className="h-4 w-4 mr-2" />
                      Take Over
                    </Button>
                  </div>
                )}

              {/* Message Input - Show if conversation is assigned to current user */}
              {(() => {
                const canShow =
                  selectedConversation &&
                  activeTab === "chats" &&
                  selectedConversation.handoff_status === "human" &&
                  selectedConversation.assigned_to_user_uuid ===
                    currentUser?.uuid;

                // Debug log when in chats tab
                if (
                  selectedConversation &&
                  activeTab === "chats" &&
                  currentUser
                ) {
                  console.log("[MessageInput] Debug:", {
                    hasConv: !!selectedConversation,
                    tab: activeTab,
                    handoffStatus: selectedConversation.handoff_status,
                    assignedTo: selectedConversation.assigned_to_user_uuid,
                    currentUserUuid: currentUser.uuid,
                    match:
                      selectedConversation.assigned_to_user_uuid ===
                      currentUser.uuid,
                    canShow,
                  });
                }

                return canShow;
              })() && (
                <div className="p-4 border-t bg-white">
                  <div className="relative">
                    <Textarea
                      placeholder="Type your message to the customer..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendAgentMessage();
                        }
                      }}
                      className="min-h-[50px] max-h-[120px] resize-none rounded-xl border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 pr-12"
                    />
                    <Button
                      onClick={sendAgentMessage}
                      disabled={!messageInput.trim() || sendingMessage}
                      size="icon"
                      className="absolute bottom-2 right-2 h-9 w-9 rounded-lg bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="h-7 w-7 text-white" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Details Sidebar */}
            <div className="w-80 border-l bg-muted/30 p-6 hidden xl:flex xl:flex-col">
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-1">Details</h3>
                <p className="text-xs text-muted-foreground">
                  Customer information
                </p>
              </div>

              <div className="space-y-6">
                {/* Customer Info Card */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Customer
                    </span>
                  </div>

                  <div className="space-y-4 pl-6">
                    {/* Name */}
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">
                        Name
                      </div>
                      <div className="text-sm font-medium">
                        {selectedConversation.customer_name || "Anonymous"}
                      </div>
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <div className="text-xs font-medium text-muted-foreground">
                          Email
                        </div>
                      </div>
                      <div className="text-sm break-all">
                        {selectedConversation.customer_email ? (
                          <a
                            href={`mailto:${selectedConversation.customer_email}`}
                            className="text-primary hover:underline"
                          >
                            {selectedConversation.customer_email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">
                            Not provided
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Phone */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <div className="text-xs font-medium text-muted-foreground">
                          Phone
                        </div>
                      </div>
                      <div className="text-sm">
                        {selectedConversation.customer_phone ? (
                          <a
                            href={`tel:${selectedConversation.customer_phone}`}
                            className="text-primary hover:underline"
                          >
                            {selectedConversation.customer_phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">
                            Not provided
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Assigned Agent Info - Show if conversation is taken over */}
                {selectedConversation.handoff_status === "human" &&
                  selectedConversation.assigned_to_user_uuid && (
                    <>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Assigned Agent
                          </span>
                        </div>

                        <div className="space-y-4 pl-6">
                          <div className="space-y-1.5">
                            <div className="text-xs font-medium text-muted-foreground">
                              Name
                            </div>
                            <div className="text-sm font-medium">
                              {assignedUser ? (
                                assignedUser.username
                              ) : (
                                <span className="text-muted-foreground">
                                  Loading...
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}

                {/* Conversation Info */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Conversation
                    </span>
                  </div>

                  <div className="space-y-4 pl-6">
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">
                        Started
                      </div>
                      <div className="text-sm">
                        {formatDistanceToNow(
                          parseDateAsUTC(selectedConversation.created_at),
                          { addSuffix: true }
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {parseDateAsUTC(
                          selectedConversation.created_at
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">
                No conversation selected
              </p>
              <p className="text-sm">
                {activeTab === "requests"
                  ? "Select a handoff request to view the conversation"
                  : "Select a conversation to view messages"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
