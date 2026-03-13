"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUsername } from "@/lib/session";

export default function RequireUsername({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const username = getStoredUsername();

    if (!username) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-sm text-neutral-500">Loading...</p>
      </main>
    );
  }

  return <>{children}</>;
}