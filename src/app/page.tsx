"use client";

import { useEffect, useRef, useState } from "react";
import InboxList from "@/components/InboxList";
import MatchReview from "@/components/MatchReview";
import ReviewScreen from "@/components/ReviewScreen";
import TokenSetup from "@/components/TokenSetup";
import { receiptFromTransaction, type ExtractedReceipt } from "@/lib/receipt";
import { clearYnabToken, getBudgetId, getYnabToken, setBudgetId } from "@/lib/storage";
import {
  daysAgoIso,
  fetchBudgets,
  fetchTransactions,
  type YnabTransaction,
} from "@/lib/ynab";
import {
  Camera,
  CheckCircle2,
  ClipboardPaste,
  Loader2,
  Rocket,
  Settings,
  ShieldCheck,
  Upload,
} from "lucide-react";

type Screen = "home" | "setup" | "review" | "match" | "success";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [checking, setChecking] = useState(true);
  const [receipt, setReceipt] = useState<ExtractedReceipt | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [inbox, setInbox] = useState<YnabTransaction[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [existingTx, setExistingTx] = useState<YnabTransaction | null>(null);
  const [successMode, setSuccessMode] = useState<"updated" | "created" | "batch">("created");
  const [successCount, setSuccessCount] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const extractingRef = useRef(false);
  const screenRef = useRef<Screen>("home");
  const attachForTxRef = useRef<YnabTransaction | null>(null);
  const existingTxRef = useRef<YnabTransaction | null>(null);

  useEffect(() => {
    extractingRef.current = extracting;
  }, [extracting]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    existingTxRef.current = existingTx;
  }, [existingTx]);

  useEffect(() => {
    const token = getYnabToken();
    setChecking(false);
    if (!token) setScreen("setup");
    else loadInbox();
  }, []);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (screenRef.current === "review") {
        attachForTxRef.current = existingTxRef.current;
      } else if (screenRef.current !== "home") {
        return;
      }
      if (extractingRef.current) return;
      const file = imageFromClipboardEvent(e);
      if (!file) return;
      e.preventDefault();
      processImage(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function loadInbox() {
    const token = getYnabToken();
    if (!token) return;
    setInboxLoading(true);
    try {
      const budgets = await fetchBudgets(token);
      const saved = getBudgetId();
      const budgetId = saved && budgets.find((b) => b.id === saved) ? saved : budgets[0]?.id;
      if (!budgetId) {
        setInbox([]);
        return;
      }
      setBudgetId(budgetId);
      const [unapproved, recentUncat] = await Promise.all([
        fetchTransactions(token, budgetId, { type: "unapproved" }),
        fetchTransactions(token, budgetId, { type: "uncategorized", sinceDate: daysAgoIso(14) }),
      ]);
      const byId = new Map<string, YnabTransaction>();
      for (const t of [...unapproved, ...recentUncat]) byId.set(t.id, t);
      const list = Array.from(byId.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      setInbox(list);
    } catch {
      // Inbox is optional — snapping still works
    } finally {
      setInboxLoading(false);
    }
  }

  function handleTokenComplete() {
    setScreen("home");
    loadInbox();
  }

  function handleDisconnect() {
    if (confirm("Disconnect your YNAB account from this device?")) {
      clearYnabToken();
      setInbox([]);
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
      const extracted: ExtractedReceipt = {
        kind: data.kind || "receipt",
        merchant: data.merchant || "Unknown",
        date: data.date || new Date().toISOString().slice(0, 10),
        total: data.total || 0,
        memo: data.memo || "",
        items: Array.isArray(data.items) ? data.items : [],
        orders: Array.isArray(data.orders) ? data.orders : [],
      };
      if (!extracted.orders.length) {
        extracted.orders = [
          {
            merchant: extracted.merchant,
            date: extracted.date,
            amount: extracted.total,
            items: extracted.items,
            memo: extracted.memo,
          },
        ];
      }
      setReceipt(extracted);

      const boundTx = attachForTxRef.current;
      attachForTxRef.current = null;

      if (boundTx) {
        setExistingTx(boundTx);
        setScreen("review");
      } else if (extracted.orders.length > 1 || extracted.kind === "order_list") {
        setExistingTx(null);
        setScreen("match");
      } else {
        setExistingTx(null);
        setScreen("review");
      }
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
      alert(
        "Could not read the clipboard. Copy the receipt image, then tap Paste — or use long-press Paste on this screen."
      );
    }
  }

  function openInboxItem(tx: YnabTransaction) {
    setExistingTx(tx);
    setReceipt(receiptFromTransaction({
      payeeName: tx.payee_name,
      date: tx.date,
      amountMilli: tx.amount,
      memo: tx.memo,
    }));
    setPreview(null);
    setScreen("review");
  }

  function attachImageForCurrent() {
    attachForTxRef.current = existingTx;
    handlePasteButton();
  }

  function resetHome() {
    setScreen("home");
    setReceipt(null);
    setPreview(null);
    setExistingTx(null);
    loadInbox();
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

  if (extracting) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-6">
        <Loader2 className="w-12 h-12 animate-spin text-orange-400 mx-auto mb-4" />
        <p className="text-zinc-300 font-medium">Reading screenshot…</p>
        <p className="text-zinc-500 text-sm mt-1">Pulling order details to match YNAB</p>
      </div>
    );
  }

  if (screen === "match" && receipt) {
    return (
      <MatchReview
        receipt={receipt}
        imagePreview={preview || undefined}
        onBack={resetHome}
        onSuccess={(count) => {
          setSuccessMode("batch");
          setSuccessCount(count);
          setScreen("success");
        }}
      />
    );
  }

  if (screen === "review" && receipt) {
    return (
      <ReviewScreen
        key={`${existingTx?.id || "new"}-${receipt.date}-${receipt.total}`}
        receipt={receipt}
        imagePreview={preview || undefined}
        existingTransaction={existingTx}
        onBack={resetHome}
        onAttachImage={existingTx ? attachImageForCurrent : undefined}
        onSuccess={(mode) => {
          setSuccessMode(mode);
          setSuccessCount(1);
          setScreen("success");
        }}
      />
    );
  }

  if (screen === "success") {
    const title =
      successMode === "created"
        ? "Sent to YNAB!"
        : successMode === "batch"
          ? `Updated ${successCount} in YNAB`
          : "Saved to YNAB!";
    const body =
      successMode === "created"
        ? "Your transaction is in your budget."
        : "The imported charge is categorized and approved. No duplicate created.";
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <p className="text-zinc-400 mb-8">{body}</p>
        <button
          onClick={resetHome}
          className="w-full bg-orange-500 hover:bg-orange-400 text-white font-semibold py-4 rounded-2xl"
        >
          Back to inbox
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

      <main className="flex-1 flex flex-col px-6 pb-8">
            {inbox.length > 0 && (
              <InboxList
                transactions={inbox}
                onSelect={openInboxItem}
                onPasteAmazon={handlePasteButton}
                onRefresh={loadInbox}
                refreshing={inboxLoading}
              />
            )}

            <div className={inbox.length ? "" : "flex-1 flex flex-col items-center justify-center"}>
              {inbox.length === 0 && (
                <>
                  <div className="w-24 h-24 rounded-3xl bg-orange-500/15 flex items-center justify-center mb-8 mx-auto">
                    <Rocket className="w-12 h-12 text-orange-400" />
                  </div>
                  <h1 className="text-2xl font-bold mb-2 text-center">Snap or paste</h1>
                  <p className="text-zinc-400 text-center mb-10 max-w-xs mx-auto">
                    Paper receipt, or an Amazon order screenshot. We’ll match it to the charge already
                    in YNAB.
                  </p>
                </>
              )}

              {inbox.length > 0 && (
                <p className="text-[13px] font-medium text-zinc-500 mb-3">Or snap a paper receipt</p>
              )}

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
            </div>
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
          Provided as-is. You are responsible for this device and your YNAB account. The maker is not
          liable for unauthorized access or loss.
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
