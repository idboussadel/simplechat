"use client";

import { use, useEffect, useState } from "react";
import {
  Code,
  Copy,
  Check,
  Loader2,
  Rocket,
  AlertCircle,
  Monitor,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import toast from "react-hot-toast";

interface Chatbot {
  uuid: string;
  name: string;
  is_active: boolean;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  buttonText: string;
  buttonIcon?: React.ReactNode;
  enabled: boolean;
}

const INTEGRATIONS: Integration[] = [
  // {
  //   id: "zapier",
  //   name: "Zapier",
  //   description: "Connect your agent with thousands of apps using Zapier.",
  //   icon: "",
  //   buttonText: "Subscribe to enable",
  //   buttonIcon: <Monitor className="h-4 w-4" />,
  //   enabled: false,
  // },
  // {
  //   id: "slack",
  //   name: "Slack",
  //   description:
  //     "Connect your agent to Slack, mention it, and have it reply to any message.",
  //   icon: "",
  //   buttonText: "Subscribe to enable",
  //   buttonIcon: <Monitor className="h-4 w-4" />,
  //   enabled: false,
  // },
  {
    id: "wordpress",
    name: "WordPress",
    description:
      "Use the official Chatbase plugin for WordPress to add the chat widget to your website.",
    icon: "/logos/wordpress.svg",
    buttonText: "Setup",
    buttonIcon: <Monitor className="h-4 w-4" />,
    enabled: false,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description:
      "Connect your agent to a WhatsApp number and let it respond to messages from your customers.",
    icon: "/logos/whatssup.svg",
    buttonText: "Setup",
    buttonIcon: <Monitor className="h-4 w-4" />,
    enabled: false,
  },
  {
    id: "messenger",
    name: "Messenger",
    description:
      "Connect your agent to a Facebook page and let it respond to messages from your customers.",
    icon: "/logos/messenger.svg",
    buttonText: "Setup",
    buttonIcon: <Monitor className="h-4 w-4" />,
    enabled: false,
  },
  {
    id: "instagram",
    name: "Instagram",
    description:
      "Connect your agent to an Instagram page and let it respond to messages from your customers.",
    icon: "/logos/instagram.svg",
    buttonText: "Setup",
    buttonIcon: <Monitor className="h-4 w-4" />,
    enabled: false,
  },
  // {
  //   id: "zendesk",
  //   name: "Zendesk",
  //   description:
  //     "Create Zendesk tickets from your customers and let your agent reply to them.",
  //   icon: "",
  //   buttonText: "Subscribe to enable",
  //   buttonIcon: <Monitor className="h-4 w-4" />,
  //   enabled: false,
  // },
  // {
  //   id: "api",
  //   name: "API",
  //   description:
  //     "Integrate your agent directly with your applications using our REST API.",
  //   icon: "",
  //   buttonText: "Subscribe to enable",
  //   buttonIcon: <Monitor className="h-4 w-4" />,
  //   enabled: false,
  // },
];

export default function DeployPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const [chatbot, setChatbot] = useState<Chatbot | null>(null);
  const [embedCode, setEmbedCode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingEmbedCode, setLoadingEmbedCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const getToken = () => {
    return document.cookie
      .split("; ")
      .find((row) => row.startsWith("access_token="))
      ?.split("=")[1];
  };

  const fetchChatbot = async () => {
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(
        `${API_URL}/api/chatbots/${resolvedParams.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setChatbot(data);

        // Fetch embed code if chatbot is active
        if (data.is_active) {
          fetchEmbedCode();
        }
      }
    } catch (error) {
      console.error("Failed to fetch chatbot:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmbedCode = async () => {
    setLoadingEmbedCode(true);
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(
        `${API_URL}/api/chatbots/${resolvedParams.id}/embed`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setEmbedCode(data.embed_code);
      } else {
        const error = await response.json();
        toast.error(error.detail || "Failed to load embed code");
      }
    } catch (error) {
      console.error("Failed to fetch embed code:", error);
      toast.error("Failed to load embed code");
    } finally {
      setLoadingEmbedCode(false);
    }
  };

  useEffect(() => {
    fetchChatbot();
  }, [resolvedParams.id]);

  const copyEmbedCode = () => {
    if (!embedCode) return;

    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true);
      toast.success("Embed code copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!chatbot) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <div>
                  <h3 className="font-semibold text-red-900">Error</h3>
                  <p className="text-sm text-red-700 mt-1">
                    Failed to load chatbot information.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Rocket className="h-8 w-8 text-gray-900" />
            <h1 className="text-3xl font-bold tracking-tight">Deploy</h1>
          </div>
          <p className="text-muted-foreground">
            Embed your chatbot on any website with a simple script tag
          </p>
        </div>

        {!chatbot.is_active ? (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-yellow-900">
                    Chatbot is Inactive
                  </h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    You need to activate your chatbot before you can deploy it.
                    Please activate the chatbot first to generate the embed
                    code.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Code className="h-5 w-5" />
                      Embed Code
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Copy and paste this code into your website to add the
                      chatbot widget
                    </CardDescription>
                  </div>
                  <Button
                    onClick={copyEmbedCode}
                    disabled={!embedCode || loadingEmbedCode}
                    variant="outline"
                    size="sm"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Code
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingEmbedCode ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-600">
                      Loading embed code...
                    </span>
                  </div>
                ) : embedCode ? (
                  <div className="relative">
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
                      <code>{embedCode}</code>
                    </pre>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Failed to load embed code
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {INTEGRATIONS.map((integration) => (
                <div
                  key={integration.id}
                  className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow relative"
                >
                  <Badge className="absolute rounded-md -top-2.5 right-4 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-normal px-2 py-0.5">
                    Coming soon
                  </Badge>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 flex items-center justify-center shrink-0">
                      {integration.icon ? (
                        <Image
                          src={integration.icon}
                          alt={integration.name}
                          width={32}
                          height={32}
                          className="object-contain"
                        />
                      ) : (
                        <Zap className="h-5 w-5 text-gray-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-gray-900">
                        {integration.name}
                      </h3>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                    {integration.description}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    disabled={!integration.enabled}
                  >
                    {integration.buttonIcon && (
                      <span className="mr-1.5">{integration.buttonIcon}</span>
                    )}
                    {integration.buttonText}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
