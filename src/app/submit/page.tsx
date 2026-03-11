"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type SubmitResult =
  | { queued: true; id: number; url: string }
  | { duplicate: true; id: number; headline: string | null; status: string; url: string }
  | { error: string };

function SubmitForm() {
  const searchParams = useSearchParams();
  const incomingUrl = searchParams.get("url") ?? "";

  const [url, setUrl] = useState(incomingUrl);
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [history, setHistory] = useState<Array<{ id: number; url: string; headline?: string | null; ts: string }>>([]);
  const autoSubmitted = useRef(false);

  // Load saved key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("ice-submit-key");
    if (saved) setKey(saved);
  }, []);

  // Load submission history
  useEffect(() => {
    const saved = localStorage.getItem("ice-submit-history");
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch {}
    }
  }, []);

  // Auto-submit when a URL comes in via query param and key is already saved
  useEffect(() => {
    if (incomingUrl && key && !autoSubmitted.current) {
      autoSubmitted.current = true;
      handleSubmit(incomingUrl, key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingUrl, key]);

  async function handleSubmit(submitUrl = url, submitKey = key) {
    if (!submitUrl.startsWith("http")) return;
    setLoading(true);
    setResult(null);

    // Save key
    localStorage.setItem("ice-submit-key", submitKey);

    try {
      const res = await fetch(
        `/api/submit?url=${encodeURIComponent(submitUrl)}&key=${encodeURIComponent(submitKey)}`
      );
      const data: SubmitResult = await res.json();
      setResult(data);

      if ("id" in data) {
        const entry = {
          id: data.id,
          url: submitUrl,
          headline: "headline" in data ? data.headline : null,
          ts: new Date().toLocaleString(),
        };
        const updated = [entry, ...history].slice(0, 20);
        setHistory(updated);
        localStorage.setItem("ice-submit-history", JSON.stringify(updated));
      }
    } catch {
      setResult({ error: "Network error — please try again" });
    } finally {
      setLoading(false);
    }
  }

  const isQueued = result && "queued" in result;
  const isDuplicate = result && "duplicate" in result;
  const isError = result && "error" in result;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-warm-800 text-white px-4 py-4">
        <h1 className="text-xl font-bold">ICE Tracker</h1>
        <p className="text-sm text-warm-200 mt-0.5">Add a URL to the tracker</p>
      </div>

      <div className="flex-1 p-4 max-w-lg mx-auto w-full">

        {/* Result banner */}
        {isQueued && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="font-semibold text-green-800">✅ Added to tracker</p>
            <p className="text-sm text-green-700 mt-1 break-all">{result.url}</p>
            <p className="text-xs text-green-600 mt-1">ID #{result.id} — processing now</p>
          </div>
        )}
        {isDuplicate && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="font-semibold text-yellow-800">⚠️ Already in tracker</p>
            {result.headline && <p className="text-sm text-yellow-700 mt-1">{result.headline}</p>}
            <p className="text-xs text-yellow-600 mt-1">ID #{result.id}</p>
          </div>
        )}
        {isError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="font-semibold text-red-800">❌ {result.error}</p>
          </div>
        )}

        {/* URL input */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">URL</label>
          <textarea
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            rows={3}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-warm-500 resize-none"
          />

          <label className="block text-sm font-medium text-gray-700 mt-3 mb-2">
            Submit key
            <span className="text-xs font-normal text-gray-400 ml-1">(saved in browser)</span>
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Your submit key"
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-warm-500"
          />

          <button
            onClick={() => handleSubmit()}
            disabled={loading || !url.startsWith("http") || !key}
            className="mt-4 w-full bg-warm-700 text-white font-semibold py-3 rounded-xl text-base disabled:opacity-40 active:bg-warm-800"
          >
            {loading ? "Adding…" : "Add to Tracker"}
          </button>
        </div>

        {/* iOS Shortcut instructions */}
        <details className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
          <summary className="font-medium text-gray-700 cursor-pointer select-none">
            📱 Set up iOS Share Sheet shortcut
          </summary>
          <div className="mt-3 text-sm text-gray-600 space-y-2">
            <p>Once set up, tap <strong>Share → Add to ICE Tracker</strong> on any page — no key needed.</p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>Open the <strong>Shortcuts</strong> app on your iPhone</li>
              <li>Tap <strong>+</strong> to create a new shortcut</li>
              <li>Tap <strong>Add Action</strong> → search <em>"URL"</em> → add <strong>URL</strong> action</li>
              <li>Set URL to:<br/>
                <code className="bg-gray-100 rounded px-1 text-xs break-all block mt-1 p-2">
                  {typeof window !== "undefined" ? window.location.origin : "https://yoursite.com"}/api/submit?key=YOUR_KEY&amp;url=
                </code>
              </li>
              <li>Add action: <strong>Get Contents of URL</strong>
                <ul className="list-disc list-inside ml-4 mt-1 text-xs">
                  <li>Method: GET</li>
                </ul>
              </li>
              <li>Before the URL action, add <strong>Receive &quot;URLs&quot; from Share Sheet</strong></li>
              <li>In the URL field, append the shared URL variable at the end</li>
              <li>Tap the shortcut name → <strong>Add to Share Sheet</strong></li>
            </ol>
            <p className="text-xs text-gray-400 mt-2">
              Or use the web form: share any page → <strong>Copy Link</strong>, then open this page. The URL auto-fills and submits.
            </p>
          </div>
        </details>

        {/* Email / Zapier instructions */}
        <details className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
          <summary className="font-medium text-gray-700 cursor-pointer select-none">
            📧 Set up email submission
          </summary>
          <div className="mt-3 text-sm text-gray-600 space-y-2">
            <p>Use <strong>Zapier</strong> (free) to get a dedicated email address:</p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>Go to <strong>zapier.com</strong> and create a free account</li>
              <li>Create a Zap: <strong>Email by Zapier</strong> → <strong>Webhooks by Zapier</strong></li>
              <li>Use the Zapier email address as your trigger (e.g. <code className="bg-gray-100 rounded px-1 text-xs">abc123@robot.zapier.com</code>)</li>
              <li>Set the webhook action to GET:
                <code className="bg-gray-100 rounded px-1 text-xs break-all block mt-1 p-2">
                  {typeof window !== "undefined" ? window.location.origin : "https://yoursite.com"}/api/submit?key=YOUR_KEY&amp;url={"{{"}Body{"}}"}
                </code>
              </li>
              <li>Forward any article link to that Zapier address</li>
            </ol>
            <p className="text-xs text-gray-400 mt-2">
              Tip: On iPhone, share any page → <strong>Mail</strong> → send to your Zapier address. Or copy the URL and email it to yourself, tap the link from email.
            </p>
          </div>
        </details>

        {/* Recent submissions */}
        {history.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h2 className="font-medium text-gray-700 mb-3">Recent submissions</h2>
            <ul className="space-y-2">
              {history.slice(0, 10).map((h) => (
                <li key={`${h.id}-${h.ts}`} className="text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                  <span className="text-gray-400 text-xs">#{h.id} · {h.ts}</span>
                  {h.headline && <p className="text-gray-800 font-medium mt-0.5">{h.headline}</p>}
                  <p className="text-gray-400 text-xs truncate mt-0.5">{h.url}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SubmitPage() {
  return (
    <Suspense>
      <SubmitForm />
    </Suspense>
  );
}
