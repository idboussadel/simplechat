"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import * as Flags from "country-flag-icons/react/3x2";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

interface CreateChatbotModalProps {
  onSuccess?: () => void;
}

export function CreateChatbotModal({ onSuccess }: CreateChatbotModalProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const onSubmit = async (data: ChatbotFormData) => {
    setIsSubmitting(true);

    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      // Get token from cookie
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

      toast.success(`Chatbot "${chatbot.name}" created successfully!`);
      form.reset();
      setOpen(false);

      // Call onSuccess callback to refresh the chatbot list
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create chatbot");
      console.error("Create chatbot error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="lg" variant="dark">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-2"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          Create Chatbot
        </Button>
      </SheetTrigger>
      <SheetContent className="px-6 sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-2xl font-bold">
            Create New Chatbot
          </SheetTitle>
          <SheetDescription className="text-gray-600">
            Configure your AI chatbot with custom settings and instructions.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6 mt-2"
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
                control={form.control}
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
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                      <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
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

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Creating...
                  </>
                ) : (
                  "Create Chatbot"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
