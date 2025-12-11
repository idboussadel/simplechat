"use client";

import { use, useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Type,
  Link2,
  MessageSquare,
  Upload,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
  File,
  Globe,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import toast from "react-hot-toast";

interface Document {
  id: number;
  chatbot_uuid: string;
  filename: string;
  file_size: number;
  file_type: string;
  status: string;
  chunk_count: number;
  created_at: string;
}

interface WebsiteLink {
  id: number;
  chatbot_uuid: string;
  url: string;
  title: string | null;
  link_count: number;
  chunk_count: number;
  status: string;
  error_message: string | null;
  last_crawled_at: string | null;
  created_at: string;
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
  taskId?: string; // Celery task ID for processing
  processingProgress?: number; // Processing progress (0-100)
}

interface TaskStatus {
  id: number;
  task_id: string;
  task_type: string;
  status: string;
  progress: number;
  result_data: string | null;
  error_message: string | null;
  resource_type: string;
  resource_id: number;
  chatbot_uuid: string;
  user_uuid: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface SourcesSummary {
  files: number;
  links: number;
  totalSize: number;
  linksSize: number;
}

export default function SourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [websiteLinks, setWebsiteLinks] = useState<WebsiteLink[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [expandedLinks, setExpandedLinks] = useState<Set<number>>(new Set());
  const [deletingLinkId, setDeletingLinkId] = useState<number | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [taskStatuses, setTaskStatuses] = useState<Map<number, TaskStatus>>(
    new Map()
  ); // resource_id -> task status
  const [processingLinks, setProcessingLinks] = useState<Set<number>>(
    new Set()
  ); // Track links being processed

  // Website crawl options
  const [websiteMode, setWebsiteMode] = useState<"crawl" | "individual">(
    "crawl"
  );
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [excludePaths, setExcludePaths] = useState("");
  const [includeOnlyPaths, setIncludeOnlyPaths] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const ALLOWED_TYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/plain",
    "text/csv",
  ];

  const ALLOWED_EXTENSIONS = [
    ".pdf",
    ".docx",
    ".doc",
    ".xlsx",
    ".xls",
    ".txt",
    ".csv",
  ];
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const getToken = () => {
    return document.cookie
      .split("; ")
      .find((row) => row.startsWith("access_token="))
      ?.split("=")[1];
  };

  const fetchDocuments = async () => {
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(
        `${API_URL}/api/chatbots/${resolvedParams.id}/documents`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    }
  };

  const fetchWebsiteLinks = async () => {
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(
        `${API_URL}/api/chatbots/${resolvedParams.id}/links`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        const data = await response.json();
        setWebsiteLinks(data);
      }
    } catch (error) {
      console.error("Failed to fetch website links:", error);
    }
  };

  const fetchTaskStatus = async (resourceType: string, resourceId: number) => {
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(
        `${API_URL}/api/tasks/resource/${resourceType}/${resourceId}?chatbot_uuid=${resolvedParams.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        const task = await response.json();
        if (task) {
          setTaskStatuses((prev) => {
            const newMap = new Map(prev);
            newMap.set(resourceId, task);
            return newMap;
          });

          // If task is completed or failed, stop tracking
          if (task.status === "completed" || task.status === "failed") {
            setProcessingLinks((prev) => {
              const newSet = new Set(prev);
              newSet.delete(resourceId);
              return newSet;
            });
            // Refresh documents/links to get updated status
            fetchDocuments();
            fetchWebsiteLinks();
          }
        } else {
          // Task not found, remove from tracking
          setTaskStatuses((prev) => {
            const newMap = new Map(prev);
            newMap.delete(resourceId);
            return newMap;
          });
          setProcessingLinks((prev) => {
            const newSet = new Set(prev);
            newSet.delete(resourceId);
            return newSet;
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch task status:", error);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchWebsiteLinks();

    // Poll for status updates every 3 seconds
    const interval = setInterval(() => {
      fetchDocuments();
      fetchWebsiteLinks();

      // Poll task statuses for processing resources
      processingLinks.forEach((resourceId) => {
        // Determine resource type from documents/links
        const isDocument = documents.some((d) => d.id === resourceId);
        const resourceType = isDocument ? "document" : "website_link";
        fetchTaskStatus(resourceType, resourceId);
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [resolvedParams.id, processingLinks, documents]);

  const calculateSummary = (): SourcesSummary => {
    const filesSize = documents.reduce((sum, doc) => sum + doc.file_size, 0);
    // Estimate link data size: average chunk is ~500 characters = ~500 bytes
    const estimatedLinkSize = websiteLinks
      .filter((link) => link.status === "completed")
      .reduce((sum, link) => sum + link.chunk_count * 500, 0);
    // Total pages crawled (including the main URL)
    const totalPagesCrawled = websiteLinks
      .filter((link) => link.status === "completed")
      .reduce((sum, link) => sum + link.link_count, 0);
    return {
      files: documents.length,
      links: totalPagesCrawled,
      totalSize: filesSize + estimatedLinkSize,
      linksSize: estimatedLinkSize,
    };
  };

  const summary = calculateSummary();

  const validateFile = (file: File): string | null => {
    const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
      return `File type not allowed. Supported: ${ALLOWED_EXTENSIONS.join(
        ", "
      )}`;
    }

    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds 50MB limit`;
    }

    return null;
  };

  const uploadFile = async (file: File) => {
    const fileId = `${Date.now()}-${Math.random()}`;
    const uploadingFile: UploadingFile = {
      id: fileId,
      file,
      progress: 0,
      status: "uploading",
    };

    setUploadingFiles((prev) => [...prev, uploadingFile]);

    try {
      const token = getToken();
      if (!token) {
        throw new Error("Please login to upload documents");
      }

      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === fileId ? { ...f, progress } : f))
          );
        }
      });

      xhr.addEventListener("load", async () => {
        if (xhr.status === 201) {
          const document = (await xhr.response)
            ? JSON.parse(xhr.response)
            : null;

          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === fileId ? { ...f, status: "success", progress: 100 } : f
            )
          );
          toast.success(
            `${file.name} uploaded successfully! Processing started...`
          );

          // Fetch documents to get the new document with its ID
          const updatedDocs = await fetch(
            `${API_URL}/api/chatbots/${resolvedParams.id}/documents`,
            {
              headers: {
                Authorization: `Bearer ${getToken()}`,
              },
              credentials: "include",
            }
          ).then((r) => r.json());

          // Find the newly uploaded document and start tracking its processing
          const newDoc = updatedDocs.find(
            (d: Document) =>
              d.filename === file.name && d.status === "processing"
          );
          if (newDoc) {
            setProcessingLinks((prev) => {
              const newSet = new Set(prev);
              newSet.add(newDoc.id);
              return newSet;
            });
            fetchTaskStatus("document", newDoc.id);
          }

          setTimeout(() => {
            setUploadingFiles((prev) => prev.filter((f) => f.id !== fileId));
            fetchDocuments();
          }, 2000);
        } else {
          const error = JSON.parse(xhr.responseText);
          throw new Error(error.detail || "Failed to upload file");
        }
      });

      xhr.addEventListener("error", () => {
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  status: "error",
                  error: "Network error occurred",
                }
              : f
          )
        );
        toast.error(`Failed to upload ${file.name}`);
      });

      xhr.open(
        "POST",
        `${API_URL}/api/chatbots/${resolvedParams.id}/documents`
      );
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.send(formData);
    } catch (error: any) {
      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: "error",
                error: error.message || "Failed to upload file",
              }
            : f
        )
      );
      toast.error(error.message || `Failed to upload ${file.name}`);
    }
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const errors: string[] = [];

    fileArray.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
      } else {
        validFiles.push(file);
      }
    });

    if (errors.length > 0) {
      errors.forEach((error) => toast.error(error));
    }

    validFiles.forEach((file) => {
      uploadFile(file);
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      handleFiles(files);
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFiles]
  );

  const handleAddLink = async () => {
    if (!newLinkUrl.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(newLinkUrl);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    setIsAddingLink(true);

    try {
      const token = getToken();
      if (!token) {
        throw new Error("Please login to add links");
      }

      const response = await fetch(
        `${API_URL}/api/chatbots/${resolvedParams.id}/links`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            url: newLinkUrl,
            crawl_mode: websiteMode === "crawl" ? "crawl" : "individual",
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to add link");
      }

      const newLink = await response.json();
      toast.success("Link added! Crawling started...");
      setNewLinkUrl("");

      // Start tracking the processing task
      setProcessingLinks((prev) => {
        const newSet = new Set(prev);
        newSet.add(newLink.id);
        return newSet;
      });

      // Fetch task status immediately
      fetchTaskStatus("website_link", newLink.id);

      fetchWebsiteLinks();
    } catch (error: any) {
      toast.error(error.message || "Failed to add link");
    } finally {
      setIsAddingLink(false);
    }
  };

  const handleDeleteLink = async () => {
    if (!deletingLinkId) return;

    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(
        `${API_URL}/api/chatbots/${resolvedParams.id}/links/${deletingLinkId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (response.ok) {
        toast.success("Link deleted successfully");
        setDeletingLinkId(null);
        setDeleteConfirmText("");
        fetchWebsiteLinks();
      } else {
        throw new Error("Failed to delete link");
      }
    } catch (error) {
      toast.error("Failed to delete link");
    }
  };

  const openDeleteDialog = (linkId: number) => {
    setDeletingLinkId(linkId);
    setDeleteConfirmText("");
  };

  const closeDeleteDialog = () => {
    setDeletingLinkId(null);
    setDeleteConfirmText("");
  };

  const toggleLinkExpansion = (linkId: number) => {
    setExpandedLinks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(linkId)) {
        newSet.delete(linkId);
      } else {
        newSet.add(linkId);
      }
      return newSet;
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="max-w-5xl mx-auto">
            <div className="mb-6">
              <h1 className="text-3xl font-bold tracking-tight">
                Knowledge Base
              </h1>
              <p className="text-muted-foreground mt-1">
                Add knowledge and data to your chatbot
              </p>
            </div>

            <Tabs defaultValue="files">
              <TabsList className="grid min-w-[300px] grid-cols-2">
                <TabsTrigger value="files" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span>Files</span>
                </TabsTrigger>
                {/* <TabsTrigger value="text" className="flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  <span>Text</span>
                </TabsTrigger> */}
                <TabsTrigger value="links" className="flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  <span>Website</span>
                </TabsTrigger>
                {/* <TabsTrigger value="qa" className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  <span>Q&A</span>
                </TabsTrigger> */}
              </TabsList>

              <TabsContent value="files" className="mt-6 space-y-6">
                {/* Drag and Drop Zone */}
                <Card>
                  <CardContent className="pt-6">
                    <div
                      ref={dropZoneRef}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`
                        relative border-2 border-dashed rounded-lg p-12 text-center transition-all
                        ${
                          isDragging
                            ? "border-primary bg-primary/5 scale-[1.02]"
                            : "border-gray-300 hover:border-gray-400 bg-gray-50/50"
                        }
                      `}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFileInput}
                        accept={ALLOWED_EXTENSIONS.join(",")}
                        className="hidden"
                        id="file-upload"
                      />
                      <label
                        htmlFor="file-upload"
                        className="cursor-pointer flex flex-col items-center"
                      >
                        <div
                          className={`
                            w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-all
                            ${
                              isDragging
                                ? "bg-primary text-primary-foreground scale-110"
                                : "bg-gray-200 text-gray-600"
                            }
                          `}
                        >
                          {isDragging ? (
                            <Upload className="w-8 h-8 animate-bounce" />
                          ) : (
                            <FileText className="w-8 h-8" />
                          )}
                        </div>
                        <h3 className="text-lg font-semibold mb-2">
                          {isDragging
                            ? "Drop files here"
                            : "Drag and drop files here"}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          or{" "}
                          <span className="text-primary font-medium underline">
                            browse files
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Supported: PDF, DOCX, XLSX, TXT, CSV (max 50MB)
                        </p>
                      </label>
                    </div>
                  </CardContent>
                </Card>

                {/* Uploading Files */}
                {uploadingFiles.length > 0 && (
                  <Card>
                    <CardContent className="pt-6">
                      <h3 className="text-lg font-semibold mb-4">
                        Uploading Files ({uploadingFiles.length})
                      </h3>
                      <div className="space-y-3">
                        {uploadingFiles.map((uploadingFile) => (
                          <div
                            key={uploadingFile.id}
                            className="border rounded-lg p-4 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div
                                  className={`
                                    p-2 rounded-lg
                                    ${
                                      uploadingFile.status === "success"
                                        ? "bg-green-100"
                                        : uploadingFile.status === "error"
                                        ? "bg-red-100"
                                        : "bg-blue-100"
                                    }
                                  `}
                                >
                                  {uploadingFile.status === "success" ? (
                                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                                  ) : uploadingFile.status === "error" ? (
                                    <AlertCircle className="h-5 w-5 text-red-600" />
                                  ) : (
                                    <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">
                                    {uploadingFile.file.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatFileSize(uploadingFile.file.size)}
                                  </p>
                                </div>
                              </div>
                              {uploadingFile.status === "error" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setUploadingFiles((prev) =>
                                      prev.filter(
                                        (f) => f.id !== uploadingFile.id
                                      )
                                    );
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            {uploadingFile.status === "uploading" && (
                              <div className="space-y-1">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-primary h-2 rounded-full transition-all duration-300"
                                    style={{
                                      width: `${uploadingFile.progress}%`,
                                    }}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground text-right">
                                  {uploadingFile.progress}%
                                </p>
                              </div>
                            )}
                            {uploadingFile.status === "error" &&
                              uploadingFile.error && (
                                <p className="text-xs text-red-600">
                                  {uploadingFile.error}
                                </p>
                              )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Uploaded Documents */}
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Uploaded Documents ({documents.length})
                    </h3>
                    {documents.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No documents uploaded yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {documents.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() =>
                              router.push(
                                `/chatbot/${resolvedParams.id}/sources/file/${doc.id}`
                              )
                            }
                          >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <div className="p-2 bg-blue-100 rounded-lg">
                                <File className="h-6 w-6 text-blue-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm truncate">
                                  {doc.filename}
                                </h4>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                  <span>{formatFileSize(doc.file_size)}</span>
                                  <span>•</span>
                                  <span>{doc.file_type.toUpperCase()}</span>
                                  <span>•</span>
                                  <span>{doc.chunk_count} chunks</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Uploaded {formatDate(doc.created_at)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {doc.status === "processing" &&
                                  taskStatuses.has(doc.id) && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                        <div
                                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                                          style={{
                                            width: `${
                                              taskStatuses.get(doc.id)
                                                ?.progress || 0
                                            }%`,
                                          }}
                                        />
                                      </div>
                                      <span>
                                        {taskStatuses.get(doc.id)?.progress ||
                                          0}
                                        %
                                      </span>
                                    </div>
                                  )}
                                <div
                                  className={`
                                    px-3 py-1 rounded-full text-xs font-medium
                                    ${
                                      doc.status === "completed"
                                        ? "bg-green-100 text-green-800"
                                        : doc.status === "processing"
                                        ? "bg-yellow-100 text-yellow-800"
                                        : "bg-red-100 text-red-800"
                                    }
                                  `}
                                >
                                  {doc.status === "completed" ? (
                                    <span className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Ready
                                    </span>
                                  ) : doc.status === "processing" ? (
                                    <span className="flex items-center gap-1">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Processing
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3" />
                                      Error
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="text" className="mt-6">
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-2">
                      Add Text Content
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Paste or type text content directly
                    </p>
                    <textarea
                      className="w-full min-h-[300px] p-4 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter your text content here..."
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="links" className="mt-6 space-y-6">
                {/* Add Link Section */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold mb-1">Website</h3>
                      <p className="text-sm text-muted-foreground">
                        Crawl web pages or submit sitemaps to update your AI
                        with the latest content.
                      </p>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-6 border-2 border-dashed">
                      {/* Mode Selection */}
                      <div className="mb-6">
                        <Label className="text-sm font-medium mb-3 block">
                          Select method
                        </Label>
                        <RadioGroup
                          value={websiteMode}
                          onValueChange={(value) =>
                            setWebsiteMode(value as "crawl" | "individual")
                          }
                          className="space-y-3"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="crawl" id="crawl" />
                            <Label
                              htmlFor="crawl"
                              className="font-normal cursor-pointer flex-1"
                            >
                              Crawl website
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem
                              value="individual"
                              id="individual"
                            />
                            <Label
                              htmlFor="individual"
                              className="font-normal cursor-pointer flex-1"
                            >
                              Individual links
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      {/* URL Input */}
                      <div className="mb-4">
                        <Label className="block text-sm font-medium mb-2">
                          {websiteMode === "crawl" ? "Website URL" : "Link URL"}
                        </Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                              https://
                            </span>
                            <Input
                              type="text"
                              placeholder={
                                websiteMode === "crawl"
                                  ? "www.example.com"
                                  : "www.example.com/page"
                              }
                              value={newLinkUrl}
                              onChange={(e) => setNewLinkUrl(e.target.value)}
                              onKeyPress={(e) => {
                                if (e.key === "Enter") {
                                  handleAddLink();
                                }
                              }}
                              className="pl-20 bg-background"
                              disabled={isAddingLink}
                            />
                          </div>
                          <Button
                            onClick={handleAddLink}
                            disabled={isAddingLink || !newLinkUrl.trim()}
                            className="bg-gray-700 hover:bg-gray-800"
                          >
                            {isAddingLink ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Fetching...
                              </>
                            ) : (
                              "Fetch links"
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Advanced Options (only for crawl mode) */}
                      {websiteMode === "crawl" && (
                        <div className="mb-4">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setShowAdvancedOptions(!showAdvancedOptions)
                            }
                            className="p-0 h-auto font-medium text-sm hover:bg-transparent gap-2"
                          >
                            <span>Advanced options</span>
                            <ChevronDown
                              className={`h-4 w-4 transition-transform duration-200 ${
                                showAdvancedOptions ? "rotate-180" : ""
                              }`}
                            />
                          </Button>

                          {showAdvancedOptions && (
                            <div className="mt-3 space-y-3">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label
                                    htmlFor="exclude-paths"
                                    className="text-sm text-muted-foreground"
                                  >
                                    Exclude paths
                                  </Label>
                                  <Input
                                    id="exclude-paths"
                                    type="text"
                                    placeholder="/admin, /private, /test"
                                    value={excludePaths}
                                    onChange={(e) =>
                                      setExcludePaths(e.target.value)
                                    }
                                    className="bg-background"
                                    disabled={isAddingLink}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Comma-separated paths to exclude
                                  </p>
                                </div>

                                <div className="space-y-2">
                                  <Label
                                    htmlFor="include-only-paths"
                                    className="text-sm text-muted-foreground"
                                  >
                                    Include only paths
                                  </Label>
                                  <Input
                                    id="include-only-paths"
                                    type="text"
                                    placeholder="/docs, /help, /support"
                                    value={includeOnlyPaths}
                                    onChange={(e) =>
                                      setIncludeOnlyPaths(e.target.value)
                                    }
                                    className="bg-background"
                                    disabled={isAddingLink}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Comma-separated paths to include
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground">
                        {websiteMode === "crawl"
                          ? "The crawler will discover and crawl all pages on the website."
                          : "Add specific links to crawl individually."}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Link Sources */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold">Link sources</h3>
                    </div>

                    {websiteLinks.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No links added yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {websiteLinks.map((link) => (
                          <div key={link.id} className="border rounded-lg">
                            <div className="flex items-center justify-between p-4">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Globe className="w-5 h-5 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <a
                                      href={link.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-medium text-sm hover:underline truncate"
                                    >
                                      {link.url}
                                    </a>
                                    {link.status === "completed" && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                        New
                                      </span>
                                    )}
                                    {link.status === "removed" && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                        Removed
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                    <span>
                                      Last crawled{" "}
                                      {link.last_crawled_at
                                        ? formatDate(link.last_crawled_at)
                                        : "Never"}
                                    </span>
                                    <span>•</span>
                                    <span>Links: {link.link_count}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {(link.status === "crawling" ||
                                  link.status === "pending") &&
                                  taskStatuses.has(link.id) && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                        <div
                                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                                          style={{
                                            width: `${
                                              taskStatuses.get(link.id)
                                                ?.progress || 0
                                            }%`,
                                          }}
                                        />
                                      </div>
                                      <span>
                                        {taskStatuses.get(link.id)?.progress ||
                                          0}
                                        %
                                      </span>
                                    </div>
                                  )}
                                {link.status === "crawling" ||
                                link.status === "pending" ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                ) : link.status === "error" ? (
                                  <AlertCircle className="w-4 h-4 text-red-600" />
                                ) : null}

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleLinkExpansion(link.id)}
                                >
                                  <ChevronDown
                                    className={`w-4 h-4 transition-transform ${
                                      expandedLinks.has(link.id)
                                        ? "rotate-180"
                                        : ""
                                    }`}
                                  />
                                </Button>
                              </div>
                            </div>

                            {expandedLinks.has(link.id) && (
                              <div className="border-t p-4 bg-muted/30">
                                <div className="flex items-center justify-between">
                                  <div className="space-y-1 text-sm">
                                    <p>
                                      <span className="text-muted-foreground">
                                        Pages crawled:
                                      </span>{" "}
                                      <span className="font-medium">
                                        {link.link_count}
                                      </span>
                                    </p>
                                    <p>
                                      <span className="text-muted-foreground">
                                        Chunks created:
                                      </span>{" "}
                                      <span className="font-medium">
                                        {link.chunk_count}
                                      </span>
                                    </p>
                                    {link.error_message && (
                                      <p className="text-red-600 text-xs mt-2">
                                        Error: {link.error_message}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openDeleteDialog(link.id)}
                                    >
                                      <Trash2 className="w-4 h-4 mr-1" />
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="qa" className="mt-6">
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="text-lg font-semibold mb-2">
                      Question & Answer Pairs
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Add specific questions and answers for your chatbot
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Question
                        </label>
                        <input
                          type="text"
                          placeholder="What is your question?"
                          className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Answer
                        </label>
                        <textarea
                          placeholder="Provide the answer..."
                          className="w-full min-h-[150px] p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <Button className="w-full sm:w-auto">Add Q&A Pair</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Sidebar - Sources Summary */}
      <div className="w-xs border-l bg-muted/30 p-6 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-6">Sources</h2>

        <div className="space-y-4">
          {/* File Type Counts */}
          {(() => {
            const fileTypeCounts = documents.reduce(
              (acc, doc) => {
                if (!doc.filename) return acc;
                const ext = doc.filename.split(".").pop()?.toLowerCase();
                if (ext === "pdf") {
                  acc.pdf.count++;
                  acc.pdf.size += doc.file_size || 0;
                } else if (["doc", "docx"].includes(ext || "")) {
                  acc.word.count++;
                  acc.word.size += doc.file_size || 0;
                } else if (["xls", "xlsx"].includes(ext || "")) {
                  acc.excel.count++;
                  acc.excel.size += doc.file_size || 0;
                } else if (ext === "txt") {
                  acc.txt.count++;
                  acc.txt.size += doc.file_size || 0;
                }
                return acc;
              },
              {
                pdf: { count: 0, size: 0 },
                word: { count: 0, size: 0 },
                excel: { count: 0, size: 0 },
                txt: { count: 0, size: 0 },
              }
            );

            return (
              <>
                {fileTypeCounts.pdf.count > 0 && (
                  <div className="bg-background rounded-lg p-4 border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src="/pdf.svg" alt="PDF" className="w-7 h-7" />
                        <span className="text-sm">
                          {fileTypeCounts.pdf.count} PDF
                          {fileTypeCounts.pdf.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        {formatFileSize(fileTypeCounts.pdf.size)}
                      </span>
                    </div>
                  </div>
                )}

                {fileTypeCounts.word.count > 0 && (
                  <div className="bg-background rounded-lg p-4 border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src="/word.svg" alt="Word" className="w-5 h-5" />
                        <span className="text-sm">
                          {fileTypeCounts.word.count} Word
                          {fileTypeCounts.word.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        {formatFileSize(fileTypeCounts.word.size)}
                      </span>
                    </div>
                  </div>
                )}

                {fileTypeCounts.excel.count > 0 && (
                  <div className="bg-background rounded-lg p-4 border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src="/excel.svg" alt="Excel" className="w-5 h-5" />
                        <span className="text-sm">
                          {fileTypeCounts.excel.count} Excel
                          {fileTypeCounts.excel.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        {formatFileSize(fileTypeCounts.excel.size)}
                      </span>
                    </div>
                  </div>
                )}

                {fileTypeCounts.txt.count > 0 && (
                  <div className="bg-background rounded-lg p-4 border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src="/txt.svg" alt="TXT" className="w-5 h-5" />
                        <span className="text-sm">
                          {fileTypeCounts.txt.count} TXT
                          {fileTypeCounts.txt.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        {formatFileSize(fileTypeCounts.txt.size)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* Links Count */}
          {summary.links > 0 && (
            <div className="bg-background rounded-lg p-4 border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-green-600" />
                  <span className="text-sm">
                    {summary.links} Link{summary.links !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-sm font-medium">
                  {formatFileSize(summary.linksSize)}
                </span>
              </div>
            </div>
          )}

          {/* Total Storage Usage */}
          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Storage Used
              </span>
              <span className="text-xs font-medium">
                {formatFileSize(summary.totalSize)} / 200 MB
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    (summary.totalSize / (200 * 1024 * 1024)) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {((summary.totalSize / (200 * 1024 * 1024)) * 100).toFixed(1)}% of
              storage limit used
            </p>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deletingLinkId !== null}
        onOpenChange={(open) => !open && closeDeleteDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Website Link</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              website link, all crawled pages, and all associated embeddings
              from your chatbot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <label className="text-sm font-medium mb-2 block">
              Type{" "}
              <span className="font-bold text-red-600">delete this link</span>{" "}
              to confirm:
            </label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete this link"
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDeleteDialog}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLink}
              disabled={deleteConfirmText !== "delete this link"}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
