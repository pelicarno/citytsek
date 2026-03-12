import Link from "next/link";

export const metadata = {
  title: "Thank You — CityTsek",
};

export default function ThankYouPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md">
        <span className="text-5xl">💚</span>
        <h1 className="mt-4 text-2xl font-bold text-zinc-800 dark:text-zinc-100">
          Thank you for your donation!
        </h1>
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Your support helps keep CityTsek free and funds new features and tools. We really
          appreciate it.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
        >
          Back to CityTsek
        </Link>
      </div>
    </div>
  );
}
