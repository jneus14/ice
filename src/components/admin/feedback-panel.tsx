"use client";

import { useState } from "react";

type FeedbackItem = {
  id: number;
  name: string | null;
  email: string | null;
  message: string;
  createdAt: Date;
};

export function FeedbackPanel({ feedback }: { feedback: FeedbackItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-warm-200 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-warm-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-warm-700">
            💬 User Feedback
          </span>
          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
            {feedback.length}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-warm-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-warm-200 divide-y divide-warm-100 max-h-96 overflow-y-auto">
          {feedback.map((f) => (
            <div key={f.id} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-warm-800">
                  {f.name || "Anonymous"}
                </span>
                {f.email && (
                  <a
                    href={`mailto:${f.email}`}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    {f.email}
                  </a>
                )}
                <span className="text-xs text-warm-400 ml-auto">
                  {new Date(f.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-sm text-warm-600">{f.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
