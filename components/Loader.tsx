"use client";

interface LoaderProps {
  phase: "lookup" | "analyze";
}

const MESSAGES = {
  lookup: [
    "Looking up property...",
    "Scraping comparable sales...",
    "This can take up to 30 seconds...",
  ],
  analyze: ["Filtering comparables...", "Running regression analysis...", "Generating report..."],
};

export default function Loader({ phase }: LoaderProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <div className="relative h-20 w-20">
        {/* Outer ring */}
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-zinc-200 border-t-amber-500 dark:border-zinc-700 dark:border-t-amber-400" />
        {/* Inner building icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="h-8 w-8 animate-pulse text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205 3 1m1.5.5-1.5-.5M6.75 7.364V3h-3v18m3-13.636 10.5-3.819"
            />
          </svg>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        {MESSAGES[phase].map((msg, i) => (
          <p
            key={msg}
            className="text-sm text-zinc-500 dark:text-zinc-400"
            style={{
              animation: `fadeInUp 0.5s ease ${i * 1.5}s both`,
            }}
          >
            {msg}
          </p>
        ))}
      </div>
    </div>
  );
}
