"use client";

import { Camera, Inbox, Store } from "lucide-react";

export type AppTab = "inbox" | "amazon" | "snap";

export default function AppNav({
  tab,
  inboxCount,
  onChange,
}: {
  tab: AppTab;
  inboxCount: number;
  onChange: (tab: AppTab) => void;
}) {
  const items: { id: AppTab; label: string; icon: typeof Inbox; badge?: number }[] = [
    { id: "inbox", label: "Inbox", icon: Inbox, badge: inboxCount || undefined },
    { id: "amazon", label: "Amazon", icon: Store },
    { id: "snap", label: "Snap", icon: Camera },
  ];

  return (
    <nav className="safe-bottom border-t border-zinc-800 bg-zinc-950/95 backdrop-blur px-2 pt-2">
      <div className="grid grid-cols-3 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`relative flex flex-col items-center gap-0.5 py-2 rounded-xl text-[11px] font-medium ${
                active ? "text-orange-400" : "text-zinc-500"
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
              {item.badge ? (
                <span className="absolute top-1 right-1/4 min-w-4 h-4 px-1 rounded-full bg-orange-500 text-[10px] text-white leading-4">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
