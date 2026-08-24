"use client";

import { useState } from "react";
import { setYnabToken } from "@/lib/storage";
import { fetchBudgets } from "@/lib/ynab";
import { ExternalLink, KeyRound, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";

type Props = {
  onComplete: () => void;
};

export default function TokenSetup({ onComplete }: Props) {
  const [token, setToken] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSave() {
    if (!token.trim() || !accepted) return;
    setStatus("checking");
    setErrorMsg("");

    try {
      await fetchBudgets(token.trim());
      setYnabToken(token.trim());
      setStatus("success");
      setTimeout(() => onComplete(), 800);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Invalid token or network error");
    }
  }

  return (
    <div className="min-h-dvh flex flex-col px-5 pt-12 pb-8 max-w-md mx-auto">
      <div className="flex-1">
        <div className="mb-6">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/20 flex items-center justify-center mb-5">
            <KeyRound className="w-7 h-7 text-orange-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Connect your YNAB</h1>
          <p className="text-zinc-400 text-[15px] leading-relaxed">
            Receipt Rocket needs a Personal Access Token so it can send transactions into your budget.
          </p>
        </div>

        <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-emerald-300 text-[15px]">Your token never leaves this device</p>
              <ul className="mt-2 space-y-1.5 text-[13px] text-zinc-300 leading-snug">
                <li>Stored only in this browser — not on our servers, not in the cloud.</li>
                <li>Never sent to Grok. Receipt photos go to Grok; your YNAB token does not.</li>
                <li>When you send a transaction, this device talks to YNAB directly.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-zinc-700 bg-zinc-900/80 px-4 py-4">
          <p className="font-semibold text-zinc-100 text-[15px]">What this does not mean</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-zinc-400 leading-snug">
            <li>This is not a password vault. The token is not encrypted like a password manager or iPhone Keychain.</li>
            <li>Anyone who can unlock this device and open this site may be able to use your YNAB connection.</li>
            <li>You are responsible for locking your device, not sharing this link on a shared computer, and disconnecting when you are done.</li>
          </ul>
          <p className="mt-3 text-[12px] text-zinc-500 leading-relaxed">
            Receipt Rocket is provided as-is, with no warranty. The maker of this app is not responsible for stolen tokens, unauthorized YNAB access, lost money, or any other loss from using this tool. Use it at your own risk.
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-semibold shrink-0">1</div>
            <div>
              <p className="font-medium text-[15px]">Open YNAB on the web</p>
              <a href="https://app.ynab.com" target="_blank" rel="noopener noreferrer" className="text-orange-400 text-sm inline-flex items-center gap-1 mt-0.5">
                app.ynab.com <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-semibold shrink-0">2</div>
            <div>
              <p className="font-medium text-[15px]">Go to Account Settings → Developer Settings</p>
              <a href="https://app.ynab.com/settings/developer" target="_blank" rel="noopener noreferrer" className="text-orange-400 text-sm inline-flex items-center gap-1 mt-1">
                Developer Settings <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-semibold shrink-0">3</div>
            <div>
              <p className="font-medium text-[15px]">Create a new Personal Access Token</p>
              <p className="text-zinc-500 text-sm mt-0.5">Click “New Token”, enter your password, then copy the token that appears.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-semibold shrink-0">4</div>
            <div>
              <p className="font-medium text-[15px]">Paste it below</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-300">Personal Access Token</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your token here"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-[15px] placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
            autoComplete="off"
            spellCheck={false}
          />

          <label className="flex items-start gap-3 pt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-900 accent-orange-500 shrink-0"
            />
            <span className="text-[13px] text-zinc-300 leading-snug">
              I understand this token is stored on this device, I am responsible for keeping this device secure, and I use Receipt Rocket at my own risk.
            </span>
          </label>

          {status === "error" && (
            <div className="flex items-start gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {status === "success" && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>Connected successfully</span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!token.trim() || !accepted || status === "checking" || status === "success"}
        className="w-full mt-8 bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold py-4 rounded-2xl transition-colors text-[16px]"
      >
        {status === "checking" ? "Checking token…" : status === "success" ? "Connected!" : "Save on this device"}
      </button>
    </div>
  );
}
