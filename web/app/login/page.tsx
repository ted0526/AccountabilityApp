"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { normalizeUsername, setStoredUsername } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function continueWithUsername() {
    const normalized = normalizeUsername(username);

    if (!normalized) {
      setError("Enter a username.");
      return;
    }

    setLoading(true);
    setError("");

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ username: normalized }, { onConflict: "username" });

    if (upsertError) {
      setError(upsertError.message);
      setLoading(false);
      return;
    }

    setStoredUsername(normalized);
    router.replace("/");
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h1 className="text-2xl font-semibold">Choose a username</h1>
        <p className="mt-2 text-sm text-neutral-500">
          This device will stay signed in with this username.
        </p>

        <input
          className="mt-5 w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none"
          placeholder="e.g. ted"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <button
          className="mt-4 w-full rounded-2xl bg-black px-4 py-3 text-white disabled:opacity-50"
          onClick={continueWithUsername}
          disabled={loading}
        >
          {loading ? "Saving..." : "Continue"}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}