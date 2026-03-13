"use client";

import { useState } from "react";

type OcrItem = {
  lineNumber: number;
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

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<OcrItem[]>([]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = e.target.files?.[0] ?? null;
    setFile(nextFile);
    setError("");
  }

  async function handleUpload() {
    if (!file) {
      setError("Please choose an image first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://127.0.0.1:8000/ocr", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed with ${res.status}`);
      }

      const data: OcrResponse = await res.json();
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  function updateItem(index: number, patch: Partial<OcrItem>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(index: number) {
    setItems((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, lineNumber: i + 1 })),
    );
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        lineNumber: prev.length + 1,
        text: "",
        done: false,
        confidence: 1,
      },
    ]);
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Accountability
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Upload a handwritten list and clean up the tasks.
          </p>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Upload image</span>
              <input
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="block w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium"
              />
            </label>

            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || loading}
              className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "Reading..." : "Extract tasks"}
            </button>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tasks</h2>
          <button
            type="button"
            onClick={addItem}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium"
          >
            Add
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {items.length === 0 ? (
            <div className="rounded-3xl bg-white p-5 text-sm text-neutral-500 shadow-sm ring-1 ring-black/5">
              No tasks yet.
            </div>
          ) : (
            items.map((item, index) => (
              <div
                key={`${item.lineNumber}-${index}`}
                className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) =>
                      updateItem(index, { done: e.target.checked })
                    }
                    className="mt-1 h-5 w-5 rounded"
                  />

                  <input
                    value={item.text}
                    onChange={(e) =>
                      updateItem(index, { text: e.target.value })
                    }
                    placeholder="Edit task..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
                  />

                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-sm text-neutral-400 hover:text-neutral-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}