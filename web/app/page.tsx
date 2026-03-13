"use client";

import { useEffect, useRef, useState } from "react";
import RequireUsername from "@/components/RequireUsername";
import { supabase } from "@/lib/supabase";
import { clearStoredUsername, getStoredUsername } from "@/lib/session";

type DailyList = {
  id: string;
  username: string;
  list_date: string;
};

type Task = {
  id: string;
  daily_list_id: string;
  text: string;
  done: boolean;
  position: number;
};

type PublicUserTasks = {
  username: string;
  listId: string;
  tasks: Task[];
};

type OcrItem = {
  lineNumber: number;
  rawText?: string;
  text: string;
  done: boolean;
  confidence: number;
};

type OcrResponse = {
  title: string;
  lineCount: number;
  rawLines: string[];
  items: OcrItem[];
  imageInfo?: {
    maxSide: number;
  };
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://192.168.0.24:8000";

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatPrettyDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function shiftDate(dateStr: string, delta: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return formatDateInput(d);
}

function HomeInner() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [username, setUsername] = useState("");
  const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()));
  const [myList, setMyList] = useState<DailyList | null>(null);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [publicTasks, setPublicTasks] = useState<PublicUserTasks[]>([]);
  const [newTask, setNewTask] = useState("");
  const [loading, setLoading] = useState(true);

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrItems, setOcrItems] = useState<OcrItem[]>([]);
  const [savingOcr, setSavingOcr] = useState(false);

  async function loadPage(currentUsername: string, date: string) {
    setLoading(true);

    await supabase
      .from("profiles")
      .upsert({ username: currentUsername }, { onConflict: "username" });

    const { data: ownList, error: ownListError } = await supabase
      .from("daily_lists")
      .upsert(
        {
          username: currentUsername,
          list_date: date,
        },
        { onConflict: "username,list_date" },
      )
      .select()
      .single();

    if (ownListError || !ownList) {
      console.error(ownListError);
      setLoading(false);
      return;
    }

    setMyList(ownList);

    const { data: ownTasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("daily_list_id", ownList.id)
      .order("position", { ascending: true });

    setMyTasks(ownTasks ?? []);

    const { data: otherLists } = await supabase
      .from("daily_lists")
      .select("*")
      .eq("list_date", date)
      .neq("username", currentUsername)
      .order("username", { ascending: true });

    if (!otherLists || otherLists.length === 0) {
      setPublicTasks([]);
      setLoading(false);
      return;
    }

    const listIds = otherLists.map((list) => list.id);

    const { data: allOtherTasks } = await supabase
      .from("tasks")
      .select("*")
      .in("daily_list_id", listIds)
      .order("position", { ascending: true });

    const grouped: PublicUserTasks[] = otherLists.map((list) => ({
      username: list.username,
      listId: list.id,
      tasks: (allOtherTasks ?? []).filter(
        (task) => task.daily_list_id === list.id,
      ),
    }));

    setPublicTasks(grouped);
    setLoading(false);
  }

  useEffect(() => {
    async function boot() {
      const stored = getStoredUsername();
      if (!stored) return;

      setUsername(stored);
      await loadPage(stored, selectedDate);
    }

    boot();
  }, [selectedDate]);

  async function addTask() {
    if (!myList) return;
    const text = newTask.trim();
    if (!text) return;

    const nextPosition = myTasks.length;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        daily_list_id: myList.id,
        text,
        done: false,
        position: nextPosition,
      })
      .select()
      .single();

    if (!error && data) {
      setMyTasks((prev) => [...prev, data]);
      setNewTask("");
    }
  }

  async function toggleMyTask(taskId: string, done: boolean) {
    const { error } = await supabase
      .from("tasks")
      .update({ done })
      .eq("id", taskId);

    if (!error) {
      setMyTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, done } : task)),
      );
    }
  }

  function signOutDevice() {
    clearStoredUsername();
    window.location.href = "/login";
  }

  function openScanPicker() {
    setOcrError("");
    fileInputRef.current?.click();
  }

  async function handleFileSelected(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    setOcrError("");
    setOcrItems([]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/ocr`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed with ${res.status}`);
      }

      const data: OcrResponse = await res.json();
      setOcrItems(data.items ?? []);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setOcrLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function updateOcrItem(index: number, patch: Partial<OcrItem>) {
    setOcrItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function removeOcrItem(index: number) {
    setOcrItems((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, lineNumber: i + 1 })),
    );
  }

  function addOcrItem() {
    setOcrItems((prev) => [
      ...prev,
      {
        lineNumber: prev.length + 1,
        text: "",
        done: false,
        confidence: 1,
      },
    ]);
  }

  async function saveOcrToDay() {
    if (!myList) return;

    const cleaned = ocrItems
      .map((item) => ({
        text: item.text.trim(),
        done: item.done,
      }))
      .filter((item) => item.text.length > 0);

    if (cleaned.length === 0) {
      setOcrError("No extracted tasks to save.");
      return;
    }

    setSavingOcr(true);
    setOcrError("");

    try {
      const startPosition = myTasks.length;

      const payload = cleaned.map((item, index) => ({
        daily_list_id: myList.id,
        text: item.text,
        done: item.done,
        position: startPosition + index,
      }));

      const { data, error } = await supabase
        .from("tasks")
        .insert(payload)
        .select();

      if (error) {
        throw new Error(error.message);
      }

      setMyTasks((prev) => [...prev, ...(data ?? [])]);
      setOcrItems([]);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingOcr(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center bg-neutral-50">
        <p className="text-sm text-neutral-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-6 text-neutral-900">
      <div className="mx-auto max-w-xl">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          //capture="environment"
          className="hidden"
          onChange={handleFileSelected}
        />

        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Accountability</h1>
            <p className="mt-1 text-sm text-neutral-500">@{username}</p>
          </div>

          <button
            onClick={signOutDevice}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            Switch user
          </button>
        </div>

        <div className="mb-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setSelectedDate((prev) => shiftDate(prev, -1))}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            >
              ←
            </button>

            <div className="text-center">
              <div className="text-xs uppercase tracking-wide text-neutral-400">
                Day
              </div>
              <div className="text-lg font-semibold">
                {formatPrettyDate(selectedDate)}
              </div>
            </div>

            <button
              onClick={() => setSelectedDate((prev) => shiftDate(prev, 1))}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            >
              →
            </button>
          </div>

          <button
            onClick={() => setSelectedDate(formatDateInput(new Date()))}
            className="mt-3 w-full rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white"
          >
            Jump to today
          </button>
        </div>

        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">My Tasks</h2>
              <p className="text-sm text-neutral-500">
                {formatPrettyDate(selectedDate)}
              </p>
            </div>

            <button
              onClick={openScanPicker}
              disabled={ocrLoading}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {ocrLoading ? "Scanning..." : "Scan"}
            </button>
          </div>

          <div className="mb-4 flex gap-2">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Add a task"
              className="flex-1 rounded-2xl border border-neutral-200 px-4 py-3 outline-none"
            />
            <button
              onClick={addTask}
              className="rounded-2xl bg-black px-4 py-3 text-white"
            >
              Add
            </button>
          </div>

          <div className="space-y-3">
            {myTasks.length === 0 ? (
              <div className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-500">
                No tasks yet.
              </div>
            ) : (
              myTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-4"
                >
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={(e) => toggleMyTask(task.id, e.target.checked)}
                      className="h-5 w-5"
                    />
                    <span
                      className={
                        task.done ? "line-through text-neutral-400" : ""
                      }
                    >
                      {task.text}
                    </span>
                  </label>
                </div>
              ))
            )}
          </div>
        </section>

        {(ocrError || ocrItems.length > 0) && (
          <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Scanned Tasks</h2>
                <p className="text-sm text-neutral-500">
                  Review before adding to {formatPrettyDate(selectedDate)}
                </p>
              </div>

              <button
                type="button"
                onClick={addOcrItem}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium"
              >
                Add
              </button>
            </div>

            {ocrError && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {ocrError}
              </div>
            )}

            <div className="space-y-3">
              {ocrItems.map((item, index) => (
                <div
                  key={`${item.lineNumber}-${index}`}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                >
                  <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
                    <span>Line {index + 1}</span>
                    <span>{item.confidence.toFixed(3)}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={(e) =>
                        updateOcrItem(index, { done: e.target.checked })
                      }
                      className="h-5 w-5 rounded"
                    />

                    <input
                      value={item.text}
                      onChange={(e) =>
                        updateOcrItem(index, { text: e.target.value })
                      }
                      placeholder="Edit task..."
                      className="flex-1 rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none"
                    />

                    <button
                      type="button"
                      onClick={() => removeOcrItem(index)}
                      className="rounded-xl px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                    >
                      Delete
                    </button>
                  </div>

                  {item.rawText && item.rawText !== item.text && (
                    <p className="mt-2 text-xs text-neutral-400">
                      OCR: {item.rawText}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {ocrItems.length > 0 && (
              <button
                type="button"
                onClick={saveOcrToDay}
                disabled={savingOcr}
                className="mt-4 w-full rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingOcr ? "Saving..." : `Add scanned tasks to ${selectedDate}`}
              </button>
            )}
          </section>
        )}

        <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Global Tasks</h2>
            <p className="text-sm text-neutral-500">
              Everyone else’s tasks for {formatPrettyDate(selectedDate)}
            </p>
          </div>

          <div className="space-y-4">
            {publicTasks.length === 0 ? (
              <div className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-500">
                No one else has tasks for this day yet.
              </div>
            ) : (
              publicTasks.map((group) => (
                <div
                  key={group.listId}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                >
                  <div className="mb-3 text-sm font-semibold text-neutral-700">
                    {group.username}
                  </div>

                  <div className="space-y-2">
                    {group.tasks.length === 0 ? (
                      <div className="text-sm text-neutral-400">No tasks.</div>
                    ) : (
                      group.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 rounded-xl bg-white px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={task.done}
                            readOnly
                            className="h-4 w-4"
                          />
                          <span
                            className={
                              task.done ? "line-through text-neutral-400" : ""
                            }
                          >
                            {task.text}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <RequireUsername>
      <HomeInner />
    </RequireUsername>
  );
}