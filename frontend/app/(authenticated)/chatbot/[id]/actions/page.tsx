"use client";

import { use } from "react";
import { Zap } from "lucide-react";

interface ActionsPageProps {
  params: Promise<{ id: string }>;
}

export default function ActionsPage({ params }: ActionsPageProps) {
  const { id: chatbotId } = use(params);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex flex-col items-center justify-center min-h-[85vh]">
        <div className="p-12 max-w-md w-full text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-blue-100">
              <Zap className="h-12 w-12 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold">Coming Soon</h1>
            <p className="text-muted-foreground mt-2">
              The Actions feature is currently under development and will be
              available soon. Stay tuned for updates!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
