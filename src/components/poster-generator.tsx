"use client";

import { useState, useRef, useEffect } from "react";
import { toPng } from "html-to-image";

type PosterProps = {
  incidentId: number;
  headline: string | null;
  summary: string | null;
  date: string | null;
  location: string | null;
  existingImageUrl?: string | null;
  onClose: () => void;
};

type PhotoOption = {
  imageUrl: string;
  source: string;
};

function extractPersonName(headline: string | null, summary: string | null): string {
  const text = `${headline ?? ""} ${summary ?? ""}`;
  const patterns = [
    /([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+(?:de\s+la\s+|de\s+|del\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,3})(?:\s*,\s*(?:a |an |who |was |is ))/,
    /(?:^|\.\s+)([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+(?:de\s+la\s+|de\s+|del\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,3})\s+was\s/,
    /(?:detained|deported|arrested|detained)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,2})/,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const name = m[1];
      const stopWords = new Set([
        "The", "This", "That", "These", "Those", "Their", "According",
        "Federal", "Immigration", "Customs", "Enforcement", "Department",
        "President", "Trump", "Biden", "Administration", "Police",
        "United", "States", "America", "Mexico", "Guatemala",
      ]);
      const first = name.split(" ")[0];
      if (!stopWords.has(first)) return name;
    }
  }
  return "Community Member";
}

function truncateDescription(summary: string | null, maxChars = 300): string {
  if (!summary) return "";
  // Split into sentences
  const sentences = summary.match(/[^.!?]+[.!?]+/g) ?? [summary];

  // Prioritize sentences with humanizing info (family, career, hobbies, age, community)
  const humanizingPatterns = /\b(father|mother|parent|child|children|daughter|son|family|husband|wife|spouse|married|baby|pregnant|years? old|age \d|lived|resident|worked|worker|job|career|doctor|teacher|nurse|cook|chef|student|school|church|community|volunteer|neighbor|friend|loved)\b/i;

  const scored = sentences.map((s, i) => ({
    text: s.trim(),
    score: humanizingPatterns.test(s) ? 10 : 0,
    order: i,
  }));

  // Take humanizing sentences first, then in order, up to maxChars
  scored.sort((a, b) => b.score - a.score || a.order - b.order);

  let result = "";
  const used = new Set<number>();

  for (const s of scored) {
    if (result.length + s.text.length + 1 > maxChars) continue;
    used.add(s.order);
    result += (result ? " " : "") + s.text;
  }

  // If we got nothing useful, just take sentences in order
  if (!result) {
    for (const s of sentences) {
      const trimmed = s.trim();
      if (result.length + trimmed.length + 1 > maxChars) break;
      result += (result ? " " : "") + trimmed;
    }
  }

  // Never end with incomplete sentence
  if (result && !result.match(/[.!?]$/)) {
    const lastPeriod = result.lastIndexOf(".");
    const lastQuestion = result.lastIndexOf("?");
    const lastExcl = result.lastIndexOf("!");
    const lastEnd = Math.max(lastPeriod, lastQuestion, lastExcl);
    if (lastEnd > result.length * 0.4) {
      result = result.slice(0, lastEnd + 1);
    }
  }

  return result || summary.split(".")[0] + ".";
}

export function PosterGenerator({
  incidentId,
  headline,
  summary,
  date,
  location,
  existingImageUrl,
  onClose,
}: PosterProps) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [personName, setPersonName] = useState(() =>
    extractPersonName(headline, summary)
  );
  const [description, setDescription] = useState(() =>
    truncateDescription(summary)
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(existingImageUrl ?? null);
  const [photoCredit, setPhotoCredit] = useState<string>("");
  const [photoCreditUrl, setPhotoCreditUrl] = useState<string>("");
  const [allPhotos, setAllPhotos] = useState<PhotoOption[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [customUpload, setCustomUpload] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Photo positioning
  const [photoZoom, setPhotoZoom] = useState(100); // percentage
  const [photoOffsetY, setPhotoOffsetY] = useState(50); // percentage (50 = center)

  // Fetch photos from linked articles
  useEffect(() => {
    async function fetchPhotos() {
      try {
        const res = await fetch(`/api/incidents/${incidentId}/photo`, {
          headers: { "x-edit-password": "acab" },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.allPhotos) {
            setAllPhotos(data.allPhotos);
            if (!photoUrl && data.imageUrl) {
              setPhotoUrl(data.imageUrl);
              setPhotoCredit(data.source);
              // Build credit URL from the source article
              const sourcePhoto = data.allPhotos.find((p: PhotoOption) => p.imageUrl === data.imageUrl);
              if (sourcePhoto) {
                setPhotoCreditUrl(`https://${sourcePhoto.source}`);
              }
            }
          } else if (data.imageUrl) {
            setAllPhotos([{ imageUrl: data.imageUrl, source: data.source }]);
            if (!photoUrl) {
              setPhotoUrl(data.imageUrl);
              setPhotoCredit(data.source);
              setPhotoCreditUrl(`https://${data.source}`);
            }
          }
        }
      } catch {
        // No photos found
      }
      setLoadingPhotos(false);
    }
    fetchPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCustomUpload(dataUrl);
      setPhotoUrl(dataUrl);
      setPhotoCredit("");
      setPhotoCreditUrl("");
      setPhotoZoom(100);
      setPhotoOffsetY(50);
    };
    reader.readAsDataURL(file);
  }

  function selectPhoto(p: PhotoOption) {
    setPhotoUrl(p.imageUrl);
    setPhotoCredit(p.source);
    setPhotoCreditUrl(`https://${p.source}`);
    setPhotoZoom(100);
    setPhotoOffsetY(50);
  }

  async function handleDownload() {
    if (!posterRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(posterRef.current, {
        quality: 1,
        pixelRatio: 2,
        cacheBust: true,
        fetchRequestInit: { mode: "cors" },
      });
      const link = document.createElement("a");
      link.download = `missing-${personName.replace(/\s+/g, "-").toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to generate poster:", err);
      alert("Failed to generate poster. Try uploading a local photo instead of using one from a URL.");
    }
    setDownloading(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Controls */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900">Generate Poster</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Person&apos;s Name</label>
              <input
                type="text"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md border border-gray-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-1.5 rounded-md border border-gray-300 text-sm resize-y"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Photo</label>
              <div className="flex items-center gap-2 flex-wrap">
                {loadingPhotos && (
                  <span className="text-xs text-gray-400">Searching articles for photos…</span>
                )}
                {allPhotos.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => selectPhoto(p)}
                    className={`w-12 h-12 rounded-md overflow-hidden border-2 transition-colors ${
                      photoUrl === p.imageUrl ? "border-orange-500" : "border-gray-200"
                    }`}
                    title={`From ${p.source}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.imageUrl}
                      alt={`From ${p.source}`}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                  </button>
                ))}
                {customUpload && (
                  <button
                    onClick={() => {
                      setPhotoUrl(customUpload);
                      setPhotoCredit("");
                      setPhotoCreditUrl("");
                    }}
                    className={`w-12 h-12 rounded-md overflow-hidden border-2 transition-colors ${
                      photoUrl === customUpload ? "border-orange-500" : "border-gray-200"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={customUpload} alt="Uploaded" className="w-full h-full object-cover" />
                  </button>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-12 h-12 rounded-md border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500"
                >
                  +
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Photo position controls */}
            {photoUrl && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-500 w-16 shrink-0">Zoom</label>
                  <input
                    type="range"
                    min={100}
                    max={300}
                    value={photoZoom}
                    onChange={(e) => setPhotoZoom(Number(e.target.value))}
                    className="flex-1 h-1.5 accent-orange-500"
                  />
                  <span className="text-xs text-gray-400 w-10 text-right">{photoZoom}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-500 w-16 shrink-0">Position</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={photoOffsetY}
                    onChange={(e) => setPhotoOffsetY(Number(e.target.value))}
                    className="flex-1 h-1.5 accent-orange-500"
                  />
                  <span className="text-xs text-gray-400 w-10 text-right">
                    {photoOffsetY < 33 ? "Top" : photoOffsetY > 66 ? "Bottom" : "Center"}
                  </span>
                </div>
              </div>
            )}

            {/* Photo credit */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Photo Credit</label>
                <input
                  type="text"
                  value={photoCredit}
                  onChange={(e) => setPhotoCredit(e.target.value)}
                  placeholder="Photographer or source name"
                  className="w-full px-3 py-1.5 rounded-md border border-gray-300 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Credit URL</label>
                <input
                  type="text"
                  value={photoCreditUrl}
                  onChange={(e) => setPhotoCreditUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-1.5 rounded-md border border-gray-300 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Poster Preview */}
        <div className="p-4 overflow-x-auto">
          <div
            ref={posterRef}
            style={{
              width: "400px",
              fontFamily: "system-ui, -apple-system, sans-serif",
              backgroundColor: "#ffffff",
              border: "3px solid #1a1a1a",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                backgroundColor: "#1a1a1a",
                color: "#ffffff",
                textAlign: "center",
                padding: "16px 20px 12px",
              }}
            >
              <div
                style={{
                  fontSize: "36px",
                  fontWeight: "900",
                  letterSpacing: "3px",
                  lineHeight: "1",
                  marginBottom: "4px",
                }}
              >
                DISAPPEARED
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "500",
                  letterSpacing: "1px",
                  opacity: 0.8,
                }}
              >
                FROM OUR COMMUNITY
              </div>
            </div>

            {/* Photo */}
            <div
              style={{
                width: "100%",
                aspectRatio: "4/3",
                backgroundColor: "#f3f3f3",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={photoUrl}
                  alt={personName}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: `center ${photoOffsetY}%`,
                    transform: `scale(${photoZoom / 100})`,
                    transformOrigin: `center ${photoOffsetY}%`,
                  }}
                  crossOrigin="anonymous"
                />
              ) : (
                <div style={{ color: "#999", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                  No photo available
                </div>
              )}
            </div>

            {/* Name */}
            <div
              style={{
                textAlign: "center",
                padding: "16px 20px 8px",
              }}
            >
              <div
                style={{
                  fontSize: "28px",
                  fontWeight: "800",
                  color: "#1a1a1a",
                  lineHeight: "1.2",
                }}
              >
                {personName}
              </div>
            </div>

            {/* Location / Date */}
            {(location || date) && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: "12px",
                  color: "#666",
                  padding: "0 20px 8px",
                }}
              >
                {[location, date].filter(Boolean).join(" · ")}
              </div>
            )}

            {/* Description */}
            <div
              style={{
                padding: "8px 20px 16px",
                fontSize: "12px",
                lineHeight: "1.6",
                color: "#333",
                textAlign: "center",
              }}
            >
              {description}
            </div>

            {/* Footer */}
            <div
              style={{
                backgroundColor: "#1a1a1a",
                color: "#ffffff",
                textAlign: "center",
                padding: "10px 20px",
                fontSize: "10px",
              }}
            >
              <div style={{ fontWeight: "700", letterSpacing: "1px", marginBottom: "2px" }}>
                HUMAN IMPACT PROJECT
              </div>
              <div style={{ opacity: 0.6, fontSize: "9px" }}>
                hiproject.org
                {photoCredit && (
                  <>
                    {" · Photo: "}
                    {photoCredit}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Download button */}
        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 py-2.5 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {downloading ? "Generating…" : "Download PNG"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 text-gray-600 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
