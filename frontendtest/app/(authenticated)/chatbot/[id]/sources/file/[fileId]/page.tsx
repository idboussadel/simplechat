"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Calendar, HardDrive, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface Document {
  id: number;
  chatbot_uuid: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: string;
  chunk_count: number;
  created_at: string;
  extracted_text: string;
}

interface FileViewerPageProps {
  params: Promise<{ id: string; fileId: string }>;
}

export default function FileViewerPage({ params }: FileViewerPageProps) {
  const { id: chatbotId, fileId } = use(params);
  const router = useRouter();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocument();
  }, [fileId]);

  const fetchDocument = async () => {
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      // Get token from browser cookies (not the document variable!)
      const token =
        typeof window !== "undefined"
          ? window.document.cookie
              .split("; ")
              .find((row) => row.startsWith("access_token="))
              ?.split("=")[1]
          : null;

      if (!token) return;

      const response = await fetch(
        `${API_URL}/api/chatbots/${chatbotId}/documents/${fileId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDocument(data);
      }
    } catch (error) {
      console.error("Failed to fetch document:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <FileText className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Document not found</h2>
        <Button
          variant="outline"
          onClick={() => router.push(`/chatbot/${chatbotId}/sources`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sources
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/chatbot/${chatbotId}/sources`)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to files
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div>
                <h1 className="text-xl font-semibold">{document.filename}</h1>
                <Badge variant="secondary" className="mt-1">
                  {document.status === "completed" ? "New" : document.status}
                </Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="10" cy="4" r="1.5" fill="currentColor" />
                <circle cx="10" cy="10" r="1.5" fill="currentColor" />
                <circle cx="10" cy="16" r="1.5" fill="currentColor" />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Extracted Content</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground bg-muted/30 p-6 rounded-lg border">
                    {document.extracted_text || "No text content extracted"}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Details */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4" />
                    <span>Created:</span>
                  </div>
                  <p className="text-sm font-medium">
                    {formatDate(document.created_at)}
                  </p>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4" />
                    <span>Last updated:</span>
                  </div>
                  <p className="text-sm font-medium">
                    {formatDate(document.created_at)}
                  </p>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <HardDrive className="h-4 w-4" />
                    <span>Size:</span>
                  </div>
                  <p className="text-sm font-medium">
                    {formatFileSize(document.file_size)}
                  </p>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Layers className="h-4 w-4" />
                    <span>Status:</span>
                  </div>
                  <Badge
                    variant={
                      document.status === "completed" ? "default" : "secondary"
                    }
                  >
                    {document.status === "completed" ? "New" : document.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
