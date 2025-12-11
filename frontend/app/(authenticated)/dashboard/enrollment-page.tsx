"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import * as Flags from "country-flag-icons/react/3x2";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import toast from "react-hot-toast";
import { Bot, Globe, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";

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

const websiteSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
  crawl_mode: z.enum(["crawl", "individual"]),
});

type ChatbotFormData = z.infer<typeof chatbotSchema>;
type WebsiteFormData = z.infer<typeof websiteSchema>;

interface EnrollmentPageProps {
  onComplete: () => void;
}

export function EnrollmentPage({ onComplete }: EnrollmentPageProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdChatbotId, setCreatedChatbotId] = useState<string | null>(null);

  const chatbotForm = useForm<ChatbotFormData>({
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

  const websiteForm = useForm<WebsiteFormData>({
    resolver: zodResolver(websiteSchema),
    defaultValues: {
      url: "",
      crawl_mode: "crawl",
    },
  });

  const handleStep1Submit = async (data: ChatbotFormData) => {
    setIsSubmitting(true);

    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        toast.error("Please login to create a chatbot");
        return;
      }

      const response = await fetch(`${API_URL}/api/chatbots`, {
        method: "POST",
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
        throw new Error(error.detail || "Failed to create chatbot");
      }

      const chatbot = await response.json();
      setCreatedChatbotId(chatbot.uuid);
      setStep(3);
      toast.success("Chatbot created! Now add a website to crawl.");
    } catch (error: any) {
      toast.error(error.message || "Failed to create chatbot");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStep2Submit = async (data: WebsiteFormData) => {
    if (!createdChatbotId) {
      toast.error("Please complete step 1 first");
      return;
    }

    setIsSubmitting(true);

    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("access_token="))
        ?.split("=")[1];

      if (!token) {
        toast.error("Please login");
        return;
      }

      const response = await fetch(
        `${API_URL}/api/chatbots/${createdChatbotId}/links`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            url: data.url,
            crawl_mode: data.crawl_mode,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to add website");
      }

      toast.success("Website added! Your chatbot is being set up...");
      // Wait a moment then redirect
      setTimeout(() => {
        onComplete();
        router.push(`/chatbot/${createdChatbotId}/playground`);
      }, 1500);
    } catch (error: any) {
      toast.error(error.message || "Failed to add website");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipWebsite = () => {
    if (createdChatbotId) {
      toast.success("Chatbot created! You can add websites later.");
      onComplete();
      router.push(`/chatbot/${createdChatbotId}/playground`);
    }
  };

  return (
    <div className="h-[calc(100dvh-48px)] w-full flex items-center justify-center p-6 bg-gray-50">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <Bot className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Create New Chatbot</CardTitle>
          <CardDescription>
            Configure your AI chatbot with custom settings and instructions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Step Indicator */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  step === 1
                    ? "bg-blue-600 text-white"
                    : step > 1
                    ? "bg-blue-100 text-blue-600"
                    : "bg-gray-200 text-gray-400"
                }`}
              >
                1
              </div>
              <div
                className={`w-24 h-1 ${
                  step >= 2 ? "bg-blue-600" : "bg-gray-200"
                }`}
              />
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  step === 2
                    ? "bg-blue-600 text-white"
                    : step > 2
                    ? "bg-blue-100 text-blue-600"
                    : "bg-gray-200 text-gray-400"
                }`}
              >
                2
              </div>
              <div
                className={`w-24 h-1 ${
                  step === 3 ? "bg-blue-600" : "bg-gray-200"
                }`}
              />
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  step === 3
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-400"
                }`}
              >
                3
              </div>
            </div>
          </div>

          {/* Step 1: Name and Description */}
          {step === 1 && (
            <Form {...chatbotForm}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  // Validate only name and description
                  if (
                    chatbotForm.getValues("name") &&
                    chatbotForm.getValues("name").length >= 3
                  ) {
                    setStep(2);
                  } else {
                    chatbotForm.trigger("name");
                  }
                }}
                className="space-y-6"
              >
                <FormField
                  control={chatbotForm.control}
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
                          disabled={isSubmitting}
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
                  control={chatbotForm.control}
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
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormDescription className="text-sm text-gray-500">
                        Optional description (max 500 characters)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={isSubmitting}
                  >
                    Next: Configure Settings
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {/* Step 2: Language, Tone, Model, Instructions */}
          {step === 2 && (
            <Form {...chatbotForm}>
              <form
                onSubmit={chatbotForm.handleSubmit(handleStep1Submit)}
                className="space-y-6"
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={chatbotForm.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">
                          Language <span className="text-red-500">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          disabled={isSubmitting}
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
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-sm text-gray-500">
                          Primary language for responses
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={chatbotForm.control}
                    name="tone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">
                          Tone <span className="text-red-500">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          disabled={isSubmitting}
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
                            <SelectItem value="Empathetic">
                              Empathetic
                            </SelectItem>
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
                  control={chatbotForm.control}
                  name="model_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Model <span className="text-red-500">*</span>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4o-mini">
                            GPT-4o Mini
                          </SelectItem>
                          <SelectItem value="gpt-4-turbo">
                            GPT-4 Turbo
                          </SelectItem>
                          <SelectItem value="gpt-3.5-turbo">
                            GPT-3.5 Turbo
                          </SelectItem>
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
                  control={chatbotForm.control}
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
                          disabled={isSubmitting}
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

                <div className="flex justify-between pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                    disabled={isSubmitting}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Next: Add Website
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {/* Step 3: Add Website */}
          {step === 3 && (
            <Form {...websiteForm}>
              <form
                onSubmit={websiteForm.handleSubmit(handleStep2Submit)}
                className="space-y-6"
              >
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <Globe className="w-8 h-8 text-green-600" />
                  </div>
                </div>
                <div className="text-center mb-6">
                  <h3 className="text-xl font-semibold mb-2">
                    Add Website to Crawl
                  </h3>
                  <p className="text-sm text-gray-500">
                    Add a website URL to provide knowledge to your chatbot
                  </p>
                </div>

                <FormField
                  control={websiteForm.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Website URL <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com"
                          {...field}
                          className="h-11"
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormDescription className="text-sm text-gray-500">
                        Enter the URL of the website you want to crawl
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={websiteForm.control}
                  name="crawl_mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Crawl Mode
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="crawl">
                            Crawl entire website
                          </SelectItem>
                          <SelectItem value="individual">
                            Single page only
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-sm text-gray-500">
                        Choose how to crawl the website
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-between pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(2)}
                    disabled={isSubmitting}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleSkipWebsite}
                      disabled={isSubmitting}
                    >
                      Skip for now
                    </Button>
                    <Button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        "Complete Setup"
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
