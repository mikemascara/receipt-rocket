"use client";

import { useState, useEffect, useRef } from "react";
import { getYnabToken, clearYnabToken } from "@/lib/storage";
import TokenSetup from "@/components/TokenSetup";
import ReviewScreen, { type ExtractedReceipt } from "@/components/ReviewScreen";
import { Camera, Upload, Settings, Rocket, CheckCircle2, Loader2, ShieldCheck, ClipboardPaste } from "lucide-react";

type Screen = "home" | "setup" | "review" | "success";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [checking, setChecking] = useState(true);
  const [receipt, setReceipt] = useState<ExtractedReceipt | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const extractingRef = useRef(false);
  const screenRef = useRef<Screen>("home");

  useEffect(() => {
    extractingRef.current = extracting;
  }, [extracting]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    const token = getYnabToken();
    setChecking(false);
    if (!token) setScreen("setup");
  }, []);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (screenRef.current !== "home" || extractingRef.current) return;
      const file = imageFromClipboardEvent(e);
      if (!file) return;
      e.preventDefault();
      processImage(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function handleTokenComplete() {
    setScreen("home");
  }

  function handleDisconnect() {
    if (confirm("Disconnect your YNAB account from this device?")) {
      clearYnabToken();
      setScreen("setup");
    }
  }

  async function processImage(file: File) {
    setExtracting(true);
    const url = URL.createObjectURL(file);
    setPreview(url);

    try {
      const { base64, mimeType } = await fileToBase64(file);

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Extraction failed");
      }

      const data = await res.json();
      setReceipt({
        merchant: data.merchant || "Unknown",
        date: data.date || new Date().toISOString().slice(0, 10),
        total: data.total || 0,
        memo: data.memo || "",
      });
      setScreen("review");
    } catch (err: any) {
      alert(err.message || "Could not read the receipt. Try another photo.");
      setPreview(null);
    } finally {
      setExtracting(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    e.target.value = "";
  }

  async function handlePasteButton() {
    try {
      if (navigator.clipboard && "read" in navigator.clipboard) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith("image/"));
          if (!type) continue;
          const blob = await item.getType(type);
          const ext = type === "image/png" ? "png" : "jpg";
          const file = new File([blob], `pasted-receipt.${ext}`, { type });
          await processImage(file);
          return;
        }
      }
      alert("No image on the clipboard. Copy a screenshot, then tap Paste again.");
    } catch {
      alert("Could not read the clipboard. Copy the receipt image, then tap Paste — or use long-press Paste on this screen.");
    }
  }

  if (checking) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  if (screen === "setup") {
    return <TokenSetup onComplete={handleTokenComplete} />;
  }

  if (screen === "review" && receipt) {
    return (
      <ReviewScreen
        receipt={receipt}
        imagePreview={preview || undefined}
        onBack={() => {
          setScreen("home");
          setReceipt(null);
          setPreview(null);
        }}
        onSuccess={() => setScreen("success")}
      />
    );
  }

  if (screen === "success") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Sent to YNAB!</h1>
        <p className="text-zinc-400 mb-8">Your transaction is in your budget.</p>
        <button
          onClick={() => {
            setScreen("home");
            setReceipt(null);
            setPreview(null);
          }}
          className="w-full bg-orange-500 hover:bg-orange-400 text-white font-semibold py-4 rounded-2xl"
        >
          Snap another receipt
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col max-w-md mx-auto">
      <header className="flex items-center justify-between px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">Receipt Rocket</span>
        </div>
        <button
          onClick={handleDisconnect}
          className="p-2.5 rounded-full hover:bg-zinc-800 text-zinc-400"
          title="Settings / Disconnect"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
        {extracting ? (
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-orange-400 mx-auto mb-4" />
            <p className="text-zinc-300 font-medium">Reading receipt…</p>
            <p className="text-zinc-500 text-sm mt-1">This usually takes a few seconds</p>
          </div>
        ) : (
          <>
            <div className="w-24 h-24 rounded-3xl bg-orange-500/15 flex items-center justify-center mb-8">
              <Rocket className="w-12 h-12 text-orange-400" />
            </div>
            <h1 className="text-2xl font-bold mb-2 text-center">Snap a receipt</h1>
            <p className="text-zinc-400 text-center mb-10 max-w-xs">
              Take a photo, upload one, or paste a screenshot. Review, then send it to YNAB.
            </p>

            <div className="w-full space-y-3">
              <button
                onClick={() => cameraRef.current?.click()}
                className="w-full bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all text-[16px]"
              >
                <Camera className="w-5 h-5" />
                Take Photo
              </button>

              <button
                onClick={() => fileRef.current?.click()}
                className="w-full bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-zinc-100 font-medium py-4 rounded-2xl flex items-center justify-center gap-3 transition-all text-[16px]"
              >
                <Upload className="w-5 h-5" />
                Upload Photo
              </button>

              <button
                onClick={handlePasteButton}
                className="w-full bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] text-zinc-100 font-medium py-4 rounded-2xl flex items-center justify-center gap-3 transition-all text-[16px]"
              >
                <ClipboardPaste className="w-5 h-5" />
                Paste Image
              </button>
            </div>

            <p className="text-zinc-600 text-xs text-center mt-4">
              Or paste with Cmd+V / Ctrl+V (or long-press → Paste on iPhone)
            </p>

            <input
              ref={cameraRef}
              type="file"
              accept="image/jpeg,image/png,image/*"
              capture="environment"
              className="hidden"
              onChange={onFileChange}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/*"
              className="hidden"
              onChange={onFileChange}
            />
          </>
        )}
      </main>

      <footer className="px-5 pb-6 safe-bottom space-y-2">
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-[12px] text-zinc-300 leading-snug">
            <span className="font-semibold text-emerald-300">YNAB token stays on this device.</span>{" "}
            It is never uploaded to Receipt Rocket or Grok. Lock your phone. Use at your own risk.
          </p>
        </div>
        <p className="text-[11px] text-zinc-600 text-center leading-snug px-2">
          Provided as-is. You are responsible for this device and your YNAB account. The maker is not liable for unauthorized access or loss.
        </p>
      </footer>
    </div>
  );
}

function imageFromClipboardEvent(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items;
  if (items) {
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (blob) return blob;
      }
    }
  }
  const files = e.clipboardData?.files;
  if (files) {
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) return file;
    }
  }
  return null;
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(",");
      const mimeMatch = header?.match(/data:([^;]+);/);
      const mimeType = mimeMatch?.[1] || file.type || "image/jpeg";
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
