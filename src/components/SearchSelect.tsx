"use client";

import { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export type SearchOption = { id: string; label: string; hint?: string };

export default function SearchSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  emptyOption,
}: {
  label: string;
  options: SearchOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  emptyOption?: SearchOption;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected =
    options.find((o) => o.id === value) ||
    (emptyOption && value === emptyOption.id ? emptyOption : undefined);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = emptyOption ? [emptyOption, ...options] : options;
    if (!q) return list;
    return list.filter(
      (o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)
    );
  }, [options, query, emptyOption]);

  function focusSearch() {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try {
      el.setSelectionRange(el.value.length, el.value.length);
    } catch {
      // some mobile browsers reject setSelectionRange
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-[15px] text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
      >
        <span className={selected ? "text-zinc-100 truncate" : "text-zinc-500 truncate"}>
          {selected?.label || placeholder}
        </span>
        <Search className="w-4 h-4 text-zinc-500 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 -ml-2 rounded-full hover:bg-zinc-800"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold">{label}</h2>
          </div>

          <div className="px-4 pb-3">
            <label className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-3">
              <Search className="w-4 h-4 text-zinc-500 shrink-0" />
              <input
                ref={inputRef}
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onTouchEnd={focusSearch}
                onMouseUp={focusSearch}
                placeholder="Type to search…"
                className="w-full bg-transparent text-[16px] leading-6 outline-none placeholder:text-zinc-600"
                style={{ fontSize: 16 }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    focusSearch();
                  }}
                  className="p-1 text-zinc-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </label>
          </div>

          <div className="flex-1 overflow-y-auto pb-10">
            {filtered.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">No matches</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id || "empty"}
                  type="button"
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full text-left px-5 py-3.5 border-b border-zinc-900 ${
                    o.id === value ? "bg-orange-500/10 text-orange-300" : "text-zinc-100"
                  }`}
                >
                  <span className="block text-[15px] leading-snug">{o.label}</span>
                  {o.hint && (
                    <span className="block text-[12px] text-zinc-500 mt-0.5">{o.hint}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
