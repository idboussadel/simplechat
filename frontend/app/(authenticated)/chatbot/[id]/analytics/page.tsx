"use client";

import { useState, useEffect, use } from "react";
import {
  MessageCircle,
  MessageCircleMore,
  X,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AnalyticsData {
  total_conversations: number;
  total_messages: number;
  total_thumbs_up: number;
  total_thumbs_down: number;
}

interface TopicItem {
  label: string;
  count: number;
  percentage: number;
}

interface TopicsResponse {
  chatbot_uuid: string;
  topics: TopicItem[];
  total_messages: number;
  updated_at: string;
}

interface QuestionGroup {
  canonical_question: string;
  variations: string[];
  count: number;
}

interface TopicQuestionsResponse {
  topic: string;
  question_groups: QuestionGroup[];
  total_questions: number;
}

interface AnalyticsPageProps {
  params: Promise<{ id: string }>;
}

const TOPIC_COLORS = [
  "#4F46E5", // indigo
  "#22C55E", // green
  "#F97316", // orange
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#A855F7", // purple
  "#F59E0B", // amber
  "#3B82F6", // blue
];

function buildPieGradient(topics: TopicItem[]): string {
  if (!topics.length) return "conic-gradient(#e5e7eb 0deg 360deg)";

  let current = 0;
  const segments: string[] = [];

  topics.forEach((topic, index) => {
    const color = TOPIC_COLORS[index % TOPIC_COLORS.length];
    const size = Math.max(topic.percentage, 0); // guard
    const next = current + (size / 100) * 360;
    segments.push(`${color} ${current}deg ${next}deg`);
    current = next;
  });

  // If total < 100 due to rounding, fill the rest with muted gray
  if (current < 360) {
    segments.push(`#e5e7eb ${current}deg 360deg`);
  }

  return `conic-gradient(${segments.join(", ")})`;
}

export default function AnalyticsPage({ params }: AnalyticsPageProps) {
  const { id: chatbotId } = use(params);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    total_conversations: 0,
    total_messages: 0,
    total_thumbs_up: 0,
    total_thumbs_down: 0,
  });
  const [topicsData, setTopicsData] = useState<TopicsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [topicQuestions, setTopicQuestions] =
    useState<TopicQuestionsResponse | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
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
      const response = await fetch(
        `${API_URL}/api/chat/${chatbotId}/analytics`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch analytics");
      }

      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTopics = async () => {
    try {
      setLoadingTopics(true);
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
      const response = await fetch(
        `${API_URL}/api/analytics/chatbots/${chatbotId}/topics`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch topics analytics");
      }

      const data: TopicsResponse = await response.json();
      setTopicsData(data);
    } catch (error) {
      console.error("Error fetching topics analytics:", error);
    } finally {
      setLoadingTopics(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    fetchTopics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbotId]);

  const fetchTopicQuestions = async (topic: string) => {
    try {
      setLoadingQuestions(true);
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
      const response = await fetch(
        `${API_URL}/api/analytics/chatbots/${chatbotId}/topics/${encodeURIComponent(
          topic
        )}/questions`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch topic questions");
      }

      const data: TopicQuestionsResponse = await response.json();
      setTopicQuestions(data);
    } catch (error) {
      console.error("Error fetching topic questions:", error);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleTopicClick = (topic: string) => {
    setSelectedTopic(topic);
    fetchTopicQuestions(topic);
  };

  const handleCloseModal = () => {
    setSelectedTopic(null);
    setTopicQuestions(null);
  };

  const hasTopics = !!topicsData && topicsData.topics.length > 0;

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div className="mb-2">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your chatbot performance
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Conversations Card */}
        <Card className="p-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Total Conversations
              </p>
            </div>
            <p className="text-3xl font-semibold">
              {loading ? "..." : analytics.total_conversations.toLocaleString()}
            </p>
          </div>
        </Card>

        {/* Total Messages Card */}
        <Card className="p-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <MessageCircleMore className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Total Messages</p>
            </div>
            <p className="text-3xl font-semibold">
              {loading ? "..." : analytics.total_messages.toLocaleString()}
            </p>
          </div>
        </Card>

        {/* Thumbs Up Card */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Thumbs Up</p>
              <p className="text-3xl font-semibold mt-2 text-green-600">
                {loading ? "..." : analytics.total_thumbs_up.toLocaleString()}
              </p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-600"
            >
              <path d="M7 10v12" />
              <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
            </svg>
          </div>
        </Card>

        {/* Thumbs Down Card */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Thumbs Down</p>
              <p className="text-3xl font-semibold mt-2 text-red-600">
                {loading ? "..." : analytics.total_thumbs_down.toLocaleString()}
              </p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-600"
            >
              <path d="M17 14V2" />
              <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
            </svg>
          </div>
        </Card>
      </div>

      {/* Topics Card */}
      <Card className="p-6 mt-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              Topics
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Discover the most discussed topics and themes in your
              conversations to identify key interests and recurring questions.
            </p>
          </div>
        </div>

        {loadingTopics ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Loading topics...
          </div>
        ) : !hasTopics ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Not enough data yet. Topics will appear once your chatbot has more
            conversations.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6 items-center">
            {/* Pie chart */}
            <div className="flex items-center justify-center">
              <div className="relative h-40 w-40 md:h-56 md:w-56 rounded-full shadow-inner border border-border bg-muted flex items-center justify-center">
                <div
                  className="absolute inset-3 rounded-full"
                  style={{
                    backgroundImage: buildPieGradient(
                      topicsData!.topics.slice(0, 8)
                    ),
                  }}
                />
                <div className="relative z-10 flex flex-col items-center justify-center rounded-full bg-background/80 px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground">Top topics</p>
                  <p className="text-sm font-semibold">
                    {topicsData!.total_messages.toLocaleString()} messages
                  </p>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-2">
              {topicsData!.topics.slice(0, 8).map((topic, index) => {
                const color = TOPIC_COLORS[index % TOPIC_COLORS.length];
                return (
                  <button
                    key={topic.label}
                    onClick={() => handleTopicClick(topic.label)}
                    className="w-full flex items-center justify-between text-xs rounded-md border border-dashed border-border/60 px-2 py-1.5 bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-foreground font-medium">
                        {topic.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{topic.count.toLocaleString()} msgs</span>
                      <span className="font-semibold text-foreground">
                        {topic.percentage}%
                      </span>
                      <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Topic Questions Modal */}
      <Dialog open={!!selectedTopic} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              {selectedTopic}
            </DialogTitle>
            <DialogDescription>
              Most common questions grouped by similarity
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            {loadingQuestions ? (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                Loading questions...
              </div>
            ) : topicQuestions && topicQuestions.question_groups.length > 0 ? (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-4">
                  {topicQuestions.total_questions} total questions
                </div>
                {topicQuestions.question_groups.map((group, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex-1">
                        {group.canonical_question}
                      </h4>
                      <span className="ml-3 text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">
                        {group.count}
                      </span>
                    </div>
                    {group.variations.length > 0 && (
                      <div className="mt-2 pl-4 border-l-2 border-gray-300 dark:border-gray-700">
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">
                          Similar questions:
                        </div>
                        <ul className="space-y-1">
                          {group.variations.map((variation, vIndex) => (
                            <li
                              key={vIndex}
                              className="text-xs text-gray-500 dark:text-gray-500"
                            >
                              • {variation}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                No questions found for this topic
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
