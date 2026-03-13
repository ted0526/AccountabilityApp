"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function signIn() {
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback",
      },
    });

    setMessage(error ? error.message : "Check your email for the login link.");
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <input
        className="mt-4 w-full rounded-xl border p-3"
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        className="mt-4 w-full rounded-xl bg-black p-3 text-white"
        onClick={signIn}
      >
        Send magic link
      </button>
      {message && <p className="mt-3 text-sm">{message}</p>}
    </main>
  );
}