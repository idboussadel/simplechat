"use client";

import { useState, useEffect, useRef, use } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import * as Flags from "country-flag-icons/react/3x2";
import { Loader2, Moon, Sun, X } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import toast from "react-hot-toast";

const chatbotSchema = z.object({
  name: z
    .string()
    .min(3, "Name must be at least 3 characters")
    .max(100, "Name must not exceed 100 characters")
    .regex(
      /^[a-zA-Z0-9\s-_]+$/,
      "Name can only contain letters, numbers, spaces, hyphens, and underscores"
    ),
  description: z
    .string()
    .max(500, "Description must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
  language: z.string().min(1, "Please select a language"),
  tone: z.string().min(1, "Please select a tone"),
  instructions: z
    .string()
    .max(2000, "Instructions must not exceed 2000 characters")
    .optional()
    .or(z.literal("")),
  model_name: z.string().min(1, "Please select a model"),
});

type ChatbotFormData = z.infer<typeof chatbotSchema>;

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Chatbot {
  uuid: string;
  name: string;
  description?: string;
  language: string;
  tone: string;
  instructions?: string;
  model_name: string;
  is_active: boolean;
  color_primary: string;
  color_user_message: string;
  color_bot_message: string;
  color_background: string;
  color_primary_dark?: string;
  color_user_message_dark?: string;
  color_bot_message_dark?: string;
  color_background_dark?: string;
  border_radius_chatbot: number;
  border_radius_messages: number;
  welcome_message?: string;
  example_messages?: string;
  window_width: number;
  window_height: number;
  popup_message_1?: string;
  popup_message_2?: string;
}

interface PlaygroundPageProps {
  params: Promise<{ id: string }>;
}

const MODELS = [
  { value: "gpt-4o", label: "GPT-4o", icon: "/chatgpt.png" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", icon: "/chatgpt.png" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo", icon: "/chatgpt.png" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", icon: "/chatgpt.png" },
];

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

export default function PlaygroundPage({ params }: PlaygroundPageProps) {
  const { id: chatbotId } = use(params);
  const [chatbot, setChatbot] = useState<Chatbot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "configuration" | "styling" | "welcome"
  >("configuration");

  // Styling state
  const [selectedColors, setSelectedColors] = useState<string[]>([
    "#000000",
    "#7C3AED",
    "#F97316",
    "#10B981",
  ]);
  const [selectedColorsDark, setSelectedColorsDark] = useState<
    (string | null)[]
  >([null, null, null, null]);
  const [chatbotBorderRadius, setChatbotBorderRadius] = useState(16);
  const [messageBorderRadius, setMessageBorderRadius] = useState(16);
  const [inputBorderRadius, setInputBorderRadius] = useState(24);

  // Window size state
  const [windowWidth, setWindowWidth] = useState(380);
  const [windowHeight, setWindowHeight] = useState(600);

  // Welcome & Examples state
  const [welcomeMessage, setWelcomeMessage] = useState(
    "Hi! What can I help you with?"
  );
  const [exampleMessages, setExampleMessages] = useState<string[]>([]);
  const [newExampleMessage, setNewExampleMessage] = useState("");

  // Popup messages state
  const [popupMessage1, setPopupMessage1] = useState("");
  const [popupMessage2, setPopupMessage2] = useState("");

  // Chat preview state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Helper function to get current colors based on dark mode
  const getCurrentColors = () => {
    if (isDarkMode) {
      return [
        selectedColorsDark[0] || selectedColors[0],
        selectedColorsDark[1] || selectedColors[1],
        selectedColorsDark[2] || selectedColors[2],
        selectedColorsDark[3] || selectedColors[3],
      ];
    }
    return selectedColors;
  };

  const currentColors = getCurrentColors();

  const form = useForm<ChatbotFormData>({
    resolver: zodResolver(chatbotSchema),
    defaultValues: {
      name: "",
      description: "",
      language: "English",
      tone: "Professional",
      instructions: "",
      model_name: "gpt-4o-mini",
    },
  });

  // Fetch chatbot data
  useEffect(() => {
    const fetchChatbot = async () => {
      try {
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const token = document.cookie
          .split("; ")
          .find((row) => row.startsWith("access_token="))
          ?.split("=")[1];

        if (!token) {
          toast.error("Please login to view chatbot");
          return;
        }

        const response = await fetch(`${API_URL}/api/chatbots/${chatbotId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch chatbot");
        }

        const data = await response.json();
        setChatbot(data);

        // Pre-fill form
        form.reset({
          name: data.name || "",
          description: data.description || "",
          language: data.language || "English",
          tone: data.tone || "Professional",
          instructions: data.instructions || "",
          model_name: data.model_name || "gpt-4o-mini",
        });

        // Load styling settings
        setSelectedColors([
          data.color_primary || "#000000",
          data.color_user_message || "#000000",
          data.color_bot_message || "#F3F4F6",
          data.color_background || "#FFFFFF",
        ]);
        setSelectedColorsDark([
          data.color_primary_dark || null,
          data.color_user_message_dark || null,
          data.color_bot_message_dark || null,
          data.color_background_dark || null,
        ]);
        setChatbotBorderRadius(data.border_radius_chatbot || 16);
        setMessageBorderRadius(data.border_radius_messages || 16);
        setInputBorderRadius(data.border_radius_input || 24);

        // Load window size
        setWindowWidth(data.window_width || 380);
        setWindowHeight(data.window_height || 600);

        // Load welcome message and example messages
        setWelcomeMessage(
          data.welcome_message || "Hi! What can I help you with?"
        );
        setExampleMessages(
          data.example_messages ? JSON.parse(data.example_messages) : []
        );

        // Load popup messages
        setPopupMessage1(data.popup_message_1 || "");
        setPopupMessage2(data.popup_message_2 || "");
      } catch (error: any) {
        toast.error(error.message || "Failed to load chatbot");
        console.error("Fetch chatbot error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChatbot();
  }, [chatbotId, form]);

  // WebSocket connection for preview
  useEffect(() => {
    if (!chatbot) return;

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const wsProtocol = API_URL.startsWith("https://") ? "wss" : "ws";
    const wsHost = API_URL.replace(/^https?:\/\//, "");
    const wsUrl = `${wsProtocol}://${wsHost}/api/chat/ws/${chatbotId}?session_id=${sessionId}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "message" && data.role === "assistant") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.content,
            timestamp: data.timestamp,
          },
        ]);
        setIsTyping(false);
      } else if (data.type === "typing") {
        setIsTyping(data.is_typing);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setIsConnected(false);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [chatbotId, sessionId, chatbot]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const onSubmit = async (data: ChatbotFormData) => {
    setIsSaving(true);

    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        toast.error("Please login to update chatbot");
        return;
      }

      const response = await fetch(`${API_URL}/api/chatbots/${chatbotId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
          language: data.language,
          tone: data.tone,
          instructions: data.instructions || null,
          model_name: data.model_name,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to update chatbot");
      }

      const updatedChatbot = await response.json();
      setChatbot(updatedChatbot);

      toast.success("Chatbot updated successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to update chatbot");
      console.error("Update chatbot error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const sendMessage = () => {
    if (!inputMessage.trim() || !wsRef.current || !isConnected) return;

    const userMessage: Message = {
      role: "user",
      content: inputMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    wsRef.current.send(
      JSON.stringify({
        type: "message",
        message: inputMessage,
      })
    );

    setInputMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* Configuration Panel */}
      <div className="w-136 border-r bg-background overflow-y-auto">
        {/* Custom Tabs Header */}
        <div className="border-b sticky top-0 bg-background z-10">
          <div className="px-6 pt-6 pb-0">
            <h2 className="text-xl font-semibold">Chatbot Settings</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure and style your chatbot
            </p>
          </div>
          <div className="flex gap-6 px-6 mt-6">
            <button
              onClick={() => setActiveTab("configuration")}
              className={`relative pb-3 text-sm font-medium transition-colors ${
                activeTab === "configuration"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Configuration
              {activeTab === "configuration" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("styling")}
              className={`relative pb-3 text-sm font-medium transition-colors ${
                activeTab === "styling"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Styling
              {activeTab === "styling" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("welcome")}
              className={`relative pb-3 text-sm font-medium transition-colors ${
                activeTab === "welcome"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Welcome & Examples
              {activeTab === "welcome" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
              )}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "configuration" && (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="p-6 space-y-6"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Chatbot Name <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Customer Support Bot"
                        {...field}
                        className="h-11"
                        disabled={isSaving}
                      />
                    </FormControl>
                    <FormDescription className="text-sm text-gray-500">
                      Choose a unique name for your chatbot (3-100 characters)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Description
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what this chatbot will do..."
                        className="resize-none min-h-[100px]"
                        {...field}
                        disabled={isSaving}
                      />
                    </FormControl>
                    <FormDescription className="text-sm text-gray-500">
                      Optional description (max 500 characters)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Language <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSaving}
                      >
                        <FormControl>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="English">
                            <div className="flex items-center gap-2">
                              <Flags.GB className="w-5 h-4 rounded-sm object-cover" />
                              <span>English</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Spanish">
                            <div className="flex items-center gap-2">
                              <Flags.ES className="w-5 h-4 rounded-sm object-cover" />
                              <span>Spanish</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="French">
                            <div className="flex items-center gap-2">
                              <Flags.FR className="w-5 h-4 rounded-sm object-cover" />
                              <span>French</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="German">
                            <div className="flex items-center gap-2">
                              <Flags.DE className="w-5 h-4 rounded-sm object-cover" />
                              <span>German</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Chinese">
                            <div className="flex items-center gap-2">
                              <Flags.CN className="w-5 h-4 rounded-sm object-cover" />
                              <span>Chinese</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Japanese">
                            <div className="flex items-center gap-2">
                              <Flags.JP className="w-5 h-4 rounded-sm object-cover" />
                              <span>Japanese</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Arabic">
                            <div className="flex items-center gap-2">
                              <Flags.SA className="w-5 h-4 rounded-sm object-cover" />
                              <span>Arabic</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Portuguese">
                            <div className="flex items-center gap-2">
                              <Flags.PT className="w-5 h-4 rounded-sm object-cover" />
                              <span>Portuguese</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Russian">
                            <div className="flex items-center gap-2">
                              <Flags.RU className="w-5 h-4 rounded-sm object-cover" />
                              <span>Russian</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Hindi">
                            <div className="flex items-center gap-2">
                              <Flags.IN className="w-5 h-4 rounded-sm object-cover" />
                              <span>Hindi</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Client Language">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">🌐</span>
                              <span>Client Language (Auto-detect)</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-sm text-gray-500">
                        {form.watch("language") === "Client Language"
                          ? "Chatbot will automatically detect and respond in the client's language"
                          : "Chatbot's language for responses"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Tone <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSaving}
                      >
                        <FormControl>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select tone" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Professional">
                            Professional
                          </SelectItem>
                          <SelectItem value="Friendly">Friendly</SelectItem>
                          <SelectItem value="Casual">Casual</SelectItem>
                          <SelectItem value="Formal">Formal</SelectItem>
                          <SelectItem value="Enthusiastic">
                            Enthusiastic
                          </SelectItem>
                          <SelectItem value="Empathetic">Empathetic</SelectItem>
                          <SelectItem value="Direct">Direct</SelectItem>
                          <SelectItem value="Humorous">Humorous</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-sm text-gray-500">
                        Conversational style
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="model_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Model <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSaving}
                    >
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MODELS.map((model) => (
                          <SelectItem key={model.value} value={model.value}>
                            <div className="flex items-center">
                              <Image
                                src={model.icon}
                                alt="ChatGPT"
                                width={42}
                                height={42}
                                className="shrink-0"
                              />
                              <span>{model.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-sm text-gray-500">
                      Choose the AI model for your chatbot
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Custom Instructions
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., You are a helpful customer support assistant. Always greet users warmly and provide detailed answers..."
                        className="resize-none min-h-[120px]"
                        {...field}
                        disabled={isSaving}
                      />
                    </FormControl>
                    <FormDescription className="text-sm text-gray-500">
                      System prompt to guide the chatbot's behavior (max 2000
                      characters)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                variant="dark"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>Save Changes</>
                )}
              </Button>
            </form>
          </Form>
        )}
        {activeTab === "styling" && (
          /* Styling Tab Content */
          <div className="p-6 space-y-8">
            {/* Color Palette */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">
                  Light Mode Color Palette
                </h3>
                <p className="text-sm text-muted-foreground">
                  Set colors for your chatbot when the website is in light mode
                </p>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {selectedColors.map((color, index) => (
                  <div key={index} className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      {index === 0 && "Primary"}
                      {index === 1 && "User Message"}
                      {index === 2 && "Bot Message"}
                      {index === 3 && "Background"}
                    </label>
                    <label className="relative block cursor-pointer">
                      <div
                        className="w-full h-16 rounded-lg border-2 border-border transition-all hover:border-muted-foreground"
                        style={{ backgroundColor: color }}
                      />
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => {
                          const newColors = [...selectedColors];
                          newColors[index] = e.target.value;
                          setSelectedColors(newColors);
                        }}
                        className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                        style={{ transform: "translateY(10px)" }}
                      />
                    </label>
                    <div className="text-xs text-center font-mono">
                      {color.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-border" />

            {/* Dark Mode Color Palette */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">
                  Dark Mode Color Palette
                </h3>
                <p className="text-sm text-muted-foreground">
                  Optional: Set colors for dark mode. Leave empty to use light
                  mode colors.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {selectedColorsDark.map((color, index) => (
                  <div key={index} className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      {index === 0 && "Primary"}
                      {index === 1 && "User Message"}
                      {index === 2 && "Bot Message"}
                      {index === 3 && "Background"}
                    </label>
                    <label className="relative block cursor-pointer">
                      <div
                        className="w-full h-16 rounded-lg border-2 border-border transition-all hover:border-muted-foreground flex items-center justify-center"
                        style={{
                          backgroundColor: color || "#1a1a1a",
                          position: "relative",
                        }}
                      >
                        {!color && (
                          <span className="text-xs text-muted-foreground">
                            Not set
                          </span>
                        )}
                      </div>
                      <input
                        type="color"
                        value={color || "#1a1a1a"}
                        onChange={(e) => {
                          const newColors = [...selectedColorsDark];
                          newColors[index] = e.target.value;
                          setSelectedColorsDark(newColors);
                        }}
                        className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                        style={{ transform: "translateY(10px)" }}
                      />
                    </label>
                    <div className="text-xs text-center font-mono">
                      {color ? color.toUpperCase() : "—"}
                    </div>
                    {color && (
                      <button
                        type="button"
                        onClick={() => {
                          const newColors = [...selectedColorsDark];
                          newColors[index] = null;
                          setSelectedColorsDark(newColors);
                        }}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors w-full"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Chatbot Border Radius */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-base font-semibold">
                  Chatbot Border Radius
                </label>
                <Input
                  type="number"
                  min="0"
                  max="32"
                  value={chatbotBorderRadius}
                  onChange={(e) =>
                    setChatbotBorderRadius(Number(e.target.value))
                  }
                  className="w-20 h-9 text-center"
                />
              </div>
              <Slider
                value={[chatbotBorderRadius]}
                onValueChange={(value) => setChatbotBorderRadius(value[0])}
                min={0}
                max={32}
                step={1}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                Control the roundness of the chatbot window (0 = square, 32 =
                very rounded)
              </p>
            </div>

            {/* Message Border Radius */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-base font-semibold">
                  Message Border Radius
                </label>
                <Input
                  type="number"
                  min="0"
                  max="24"
                  value={messageBorderRadius}
                  onChange={(e) =>
                    setMessageBorderRadius(Number(e.target.value))
                  }
                  className="w-20 h-9 text-center"
                />
              </div>
              <Slider
                value={[messageBorderRadius]}
                onValueChange={(value) => setMessageBorderRadius(value[0])}
                min={0}
                max={24}
                step={1}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                Control the roundness of message bubbles (0 = square, 24 = very
                rounded)
              </p>
            </div>

            {/* Input Border Radius */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-base font-semibold">
                  Input Border Radius
                </label>
                <Input
                  type="number"
                  min="0"
                  max="32"
                  value={inputBorderRadius}
                  onChange={(e) => setInputBorderRadius(Number(e.target.value))}
                  className="w-20 h-9 text-center"
                />
              </div>
              <Slider
                value={[inputBorderRadius]}
                onValueChange={(value) => setInputBorderRadius(value[0])}
                min={0}
                max={32}
                step={1}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                Control the roundness of the input field (0 = square, 32 = very
                rounded)
              </p>
            </div>

            {/* Separator */}
            <div className="border-t border-border" />

            {/* Window Size */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">Window Size</h3>
                <p className="text-sm text-muted-foreground">
                  Control the chatbot window dimensions in pixels
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Width (px)
                  </label>
                  <Input
                    type="number"
                    min="300"
                    max="800"
                    value={windowWidth}
                    onChange={(e) => setWindowWidth(Number(e.target.value))}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Height (px)
                  </label>
                  <Input
                    type="number"
                    min="400"
                    max="1000"
                    value={windowHeight}
                    onChange={(e) => setWindowHeight(Number(e.target.value))}
                    className="h-11"
                  />
                </div>
              </div>
            </div>

            {/* Preview Note */}
            <div className="rounded-lg bg-muted/50 p-4 border border-border">
              <p className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">Note:</strong>{" "}
                Changes to styling will be reflected in the preview in
                real-time. Save your changes to apply them to the deployed
                widget.
              </p>
            </div>

            <Button
              onClick={async () => {
                setIsSaving(true);
                try {
                  const API_URL =
                    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                  const token = document.cookie
                    .split("; ")
                    .find((row) => row.startsWith("access_token="))
                    ?.split("=")[1];

                  if (!token) {
                    toast.error("Please login to update styling");
                    return;
                  }

                  const response = await fetch(
                    `${API_URL}/api/chatbots/${chatbotId}`,
                    {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      credentials: "include",
                      body: JSON.stringify({
                        color_primary: selectedColors[0],
                        color_user_message: selectedColors[1],
                        color_bot_message: selectedColors[2],
                        color_background: selectedColors[3],
                        color_primary_dark: selectedColorsDark[0] || null,
                        color_user_message_dark: selectedColorsDark[1] || null,
                        color_bot_message_dark: selectedColorsDark[2] || null,
                        color_background_dark: selectedColorsDark[3] || null,
                        border_radius_chatbot: chatbotBorderRadius,
                        border_radius_messages: messageBorderRadius,
                        border_radius_input: inputBorderRadius,
                        window_width: windowWidth,
                        window_height: windowHeight,
                      }),
                    }
                  );

                  if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || "Failed to update styling");
                  }

                  const updatedChatbot = await response.json();
                  setChatbot(updatedChatbot);
                  toast.success("Styling updated successfully!");
                } catch (error: any) {
                  toast.error(error.message || "Failed to update styling");
                  console.error("Update styling error:", error);
                } finally {
                  setIsSaving(false);
                }
              }}
              className="w-full "
              variant="dark"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>Save Styling</>
              )}
            </Button>
          </div>
        )}
        {activeTab === "welcome" && (
          /* Welcome & Examples Tab Content */
          <div className="p-6 space-y-8">
            {/* Welcome Message */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">
                  Welcome Message
                </h3>
                <p className="text-sm text-muted-foreground">
                  Customize the initial greeting message shown to users
                </p>
              </div>
              <Textarea
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="Hi! What can I help you with?"
                className="min-h-[100px]"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {welcomeMessage.length}/500 characters
              </p>
            </div>

            {/* Separator */}
            <div className="border-t border-border" />

            {/* Popup Messages */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">Popup Messages</h3>
                <p className="text-sm text-muted-foreground">
                  Add attention-grabbing messages that appear above the chatbot
                  button. Leave empty to hide.
                </p>
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Popup Message 1
                  </label>
                  <Input
                    value={popupMessage1}
                    onChange={(e) => setPopupMessage1(e.target.value)}
                    placeholder="e.g., Need help? Chat with us!"
                    maxLength={200}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    {popupMessage1.length}/200 characters
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Popup Message 2
                  </label>
                  <Input
                    value={popupMessage2}
                    onChange={(e) => setPopupMessage2(e.target.value)}
                    placeholder="e.g., Ask me anything!"
                    maxLength={200}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    {popupMessage2.length}/200 characters
                  </p>
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-border" />

            {/* Example Messages */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">
                  Example Questions
                </h3>
                <p className="text-sm text-muted-foreground">
                  Add example questions that users can click to start
                  conversations
                </p>
              </div>

              {/* Add New Example */}
              <div className="flex gap-2">
                <Input
                  value={newExampleMessage}
                  onChange={(e) => setNewExampleMessage(e.target.value)}
                  placeholder="Enter an example question..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newExampleMessage.trim()) {
                      setExampleMessages([
                        ...exampleMessages,
                        newExampleMessage.trim(),
                      ]);
                      setNewExampleMessage("");
                    }
                  }}
                />
                <Button
                  className="!h-11"
                  onClick={() => {
                    if (newExampleMessage.trim()) {
                      setExampleMessages([
                        ...exampleMessages,
                        newExampleMessage.trim(),
                      ]);
                      setNewExampleMessage("");
                    }
                  }}
                  disabled={!newExampleMessage.trim()}
                >
                  Add
                </Button>
              </div>

              {/* Example Messages List */}
              {exampleMessages.length > 0 ? (
                <div className="space-y-2">
                  {exampleMessages.map((msg, index) => (
                    <div
                      key={index}
                      className="group flex items-center gap-3 p-3 border border-border rounded-lg bg-background hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm flex-1 text-foreground">
                        {msg}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setExampleMessages(
                            exampleMessages.filter((_, i) => i !== index)
                          );
                        }}
                        className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        aria-label="Remove question"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No example questions added yet
                </p>
              )}
            </div>

            <Button
              onClick={async () => {
                setIsSaving(true);
                try {
                  const API_URL =
                    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                  const token = document.cookie
                    .split("; ")
                    .find((row) => row.startsWith("access_token="))
                    ?.split("=")[1];

                  if (!token) {
                    toast.error("Please login to update settings");
                    return;
                  }

                  const response = await fetch(
                    `${API_URL}/api/chatbots/${chatbotId}`,
                    {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      credentials: "include",
                      body: JSON.stringify({
                        welcome_message:
                          welcomeMessage || "Hi! What can I help you with?",
                        example_messages:
                          exampleMessages.length > 0
                            ? JSON.stringify(exampleMessages)
                            : null,
                        popup_message_1: popupMessage1 || null,
                        popup_message_2: popupMessage2 || null,
                      }),
                    }
                  );

                  if (!response.ok) {
                    const error = await response.json();
                    throw new Error(
                      error.detail || "Failed to update settings"
                    );
                  }

                  const updatedChatbot = await response.json();
                  setChatbot(updatedChatbot);
                  toast.success(
                    "Welcome message and examples updated successfully!"
                  );
                } catch (error: any) {
                  toast.error(error.message || "Failed to update settings");
                  console.error("Update error:", error);
                } finally {
                  setIsSaving(false);
                }
              }}
              className="w-full "
              variant="dark"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>Save Welcome & Examples</>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Preview Area with Dotted Background */}
      <div className="flex-1 flex flex-col relative bg-[#fafafa]">
        {/* Dotted background pattern */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle, #000 1px, transparent 1px)`,
            backgroundSize: "20px 20px",
          }}
        />

        {/* Widget Preview */}
        <div
          className={`flex-1 flex items-center justify-center relative z-10 p-12 min-h-0 transition-colors duration-300 ${
            isDarkMode ? "bg-[#1f1f1f]" : "bg-white"
          }`}
          style={{
            backgroundImage: `radial-gradient(circle, ${
              isDarkMode ? "#4a4a4a" : "#e5e5e5"
            } 1px, transparent 1px)`,
            backgroundSize: "20px 20px",
          }}
        >
          <div className="w-full max-w-md relative flex flex-col items-end gap-4 h-full max-h-full">
            {/* Popup Messages Preview */}
            {!isChatOpen && (popupMessage1 || popupMessage2) && (
              <div className="flex flex-col gap-2 items-end mb-2">
                {popupMessage1 && (
                  <div
                    className="bg-white text-gray-900 px-[18px] py-3 rounded-xl text-[15px] max-w-[320px] w-max border border-gray-200"
                    style={{ lineHeight: "1.5" }}
                  >
                    {popupMessage1}
                  </div>
                )}
                {popupMessage2 && (
                  <div
                    className="bg-white text-gray-900 px-[18px] py-3 rounded-xl text-[15px] max-w-[320px] w-max border border-gray-200"
                    style={{ lineHeight: "1.5" }}
                  >
                    {popupMessage2}
                  </div>
                )}
              </div>
            )}

            {/* Simulated Widget Container - Exact match to widget.js */}
            <div
              className={`shadow-2xl overflow-hidden transition-all duration-300 flex flex-col ${
                isChatOpen
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-95 pointer-events-none absolute"
              }`}
              style={{
                display: isChatOpen ? "flex" : "none",
                flexDirection: "column",
                backgroundColor: currentColors[3],
                borderRadius: `${chatbotBorderRadius}px`,
                width: `${windowWidth}px`,
                height: `${windowHeight}px`,
                maxWidth: "calc(100vw - 100px)",
                maxHeight: "calc(100vh - 100px)",
              }}
            >
              {/* Widget Header - matches widget.js exactly */}
              <div
                className="p-4 flex items-center justify-between border-b border-white/10"
                style={{ backgroundColor: currentColors[0] }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white font-bold text-base">
                    C
                  </div>
                  <h3 className="text-white font-semibold text-base">
                    {chatbot?.name || "Chatbot"}
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsChatOpen(false)}
                  className="text-white/70 hover:text-white"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </Button>
              </div>

              {/* Chat Messages - clean design like the reference */}
              <div
                className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-3 [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:my-1 [&_li]:leading-relaxed [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold"
                ref={scrollRef}
                style={{ backgroundColor: currentColors[3] }}
              >
                {messages.length === 0 && (
                  <div className="flex flex-col gap-3">
                    <div
                      className="p-4 max-w-[85%]"
                      style={{
                        backgroundColor: currentColors[2],
                        borderTopLeftRadius: `${messageBorderRadius}px`,
                        borderTopRightRadius: `${messageBorderRadius}px`,
                        borderBottomLeftRadius: "0",
                        borderBottomRightRadius: `${messageBorderRadius}px`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <img
                          src="/chat-logo.png"
                          alt="Bot"
                          className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                        />
                        <p className="font-semibold text-sm text-gray-900">
                          {chatbot?.name || "Chatbot"}
                        </p>
                      </div>
                      <div
                        className="text-sm text-gray-700 leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(
                            welcomeMessage || "Hi! What can I help you with?"
                          ),
                        }}
                      />
                    </div>

                    {/* Example user message */}
                    {exampleMessages.length > 0 && (
                      <div className="flex justify-end">
                        <div
                          className="px-4 py-2.5 max-w-[85%] break-words text-sm leading-relaxed text-white"
                          style={{
                            backgroundColor: currentColors[1],
                            borderTopLeftRadius: `${messageBorderRadius}px`,
                            borderTopRightRadius: `${messageBorderRadius}px`,
                            borderBottomLeftRadius: `${messageBorderRadius}px`,
                            borderBottomRightRadius: "0",
                          }}
                        >
                          <div
                            dangerouslySetInnerHTML={{
                              __html: renderMarkdown(exampleMessages[0]),
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex gap-3 ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <img
                        src="/chat-logo.png"
                        alt="Bot"
                        className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
                      />
                    )}

                    <div
                      className={`px-4 py-2.5 max-w-[85%] break-words text-sm leading-relaxed ${
                        message.role === "user" ? "text-white" : "text-gray-900"
                      }`}
                      style={
                        message.role === "user"
                          ? {
                              backgroundColor: currentColors[1],
                              borderTopLeftRadius: `${messageBorderRadius}px`,
                              borderTopRightRadius: `${messageBorderRadius}px`,
                              borderBottomLeftRadius: `${messageBorderRadius}px`,
                              borderBottomRightRadius: "0",
                            }
                          : {
                              backgroundColor: currentColors[2],
                              borderTopLeftRadius: `${messageBorderRadius}px`,
                              borderTopRightRadius: `${messageBorderRadius}px`,
                              borderBottomLeftRadius: "0",
                              borderBottomRightRadius: `${messageBorderRadius}px`,
                            }
                      }
                    >
                      {message.role === "assistant" && (
                        <p className="font-semibold text-sm mb-1">
                          {chatbot?.name || "Chatbot"}
                        </p>
                      )}
                      <div
                        className="whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(message.content),
                        }}
                      />
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex gap-3">
                    <img
                      src="/chat-logo.png"
                      alt="Bot"
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
                    />
                    <div
                      className="flex items-center gap-1.5 px-5 py-4"
                      style={{
                        backgroundColor: currentColors[2],
                        borderTopLeftRadius: `${messageBorderRadius}px`,
                        borderTopRightRadius: `${messageBorderRadius}px`,
                        borderBottomLeftRadius: "0",
                        borderBottomRightRadius: `${messageBorderRadius}px`,
                      }}
                    >
                      <div className="w-2.5 h-2.5 bg-gray-500 rounded-full animate-typing opacity-60" />
                      <div
                        className="w-2.5 h-2.5 bg-gray-500 rounded-full animate-typing opacity-60"
                        style={{ animationDelay: "0.2s" }}
                      />
                      <div
                        className="w-2.5 h-2.5 bg-gray-500 rounded-full animate-typing opacity-60"
                        style={{ animationDelay: "0.4s" }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Example Questions - above input */}
              {exampleMessages.length > 0 && messages.length === 0 && (
                <>
                  <div className=" border-gray-200 mx-4"></div>
                  <div className="flex flex-wrap-reverse gap-2 justify-end px-5 pt-3 pb-3">
                    {exampleMessages.map((msg, idx) => (
                      <div key={idx} className="overflow-hidden">
                        <Button
                          variant="outline"
                          onClick={() => {
                            // Send the message directly
                            if (!wsRef.current || !isConnected) return;
                            const userMessage: Message = {
                              role: "user",
                              content: msg,
                              timestamp: new Date().toISOString(),
                            };
                            setMessages((prev) => [...prev, userMessage]);
                            wsRef.current.send(
                              JSON.stringify({
                                type: "message",
                                message: msg,
                              })
                            );
                          }}
                          className="rounded-full hover:bg-black hover:text-white hover:border-black whitespace-normal break-words max-w-[40ch] h-auto min-h-[40px]"
                          style={{
                            borderRadius: "30px",
                          }}
                        >
                          {msg}
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Message Input - icon inside input */}
              <div
                className="p-4 border-t border-gray-200"
                style={{ backgroundColor: currentColors[3] }}
              >
                <div className="relative">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Ask a question..."
                    disabled={!isConnected}
                    className="w-full pr-12 pl-4 py-3 border-gray-300 hover:border-black focus:border-black h-12"
                    style={{ borderRadius: `${inputBorderRadius}px` }}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={sendMessage}
                    disabled={!inputMessage.trim() || !isConnected}
                    className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-black text-gray-400"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <title>Send</title>
                      <path
                        d="M7.94923 12.0508L3.38619 9.56218C2.19533 8.9127 2.20714 7.20057 3.40673 6.58403C6.71485 4.8838 10.2325 3.6213 13.8716 2.82811C14.9165 2.60037 16.1107 2.13611 16.9873 3.01273C17.8639 3.88934 17.3996 5.08353 17.1719 6.12843C16.3787 9.76753 15.1162 13.2851 13.416 16.5933C12.7994 17.7929 11.0873 17.8047 10.4378 16.6138L7.94923 12.0508ZM7.94923 12.0508L10.7064 9.29359"
                        fill="none"
                      />
                    </svg>
                  </Button>
                </div>
              </div>
            </div>

            {/* Floating Toggle Button - Always aligned to the right */}
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="w-[60px] h-[60px] cursor-pointer rounded-full shadow-xl flex items-center justify-center text-white transition-transform hover:scale-105 active:scale-95 flex-shrink-0 relative z-10"
              style={{ backgroundColor: currentColors[0] }}
            >
              {isChatOpen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              ) : (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              )}
            </button>

            {/* Dark Mode Toggle Button - Bottom Right */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="fixed bottom-6 right-6 w-12 h-12 rounded-full shadow-lg bg-gray-800 hover:bg-gray-700 text-white flex items-center justify-center transition-all duration-200 hover:scale-110 z-50"
              title={
                isDarkMode ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              {isDarkMode ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
