import { Home, Sliders, Download, Terminal, Settings } from "lucide-react";

export interface TabDef {
  id: string;
  label: string;
  icon: typeof Home;
  badge?: string;
}

export interface TabBarProps {
  tabs: TabDef[];
  activeTab: string;
  onSelect: (tabId: string) => void;
}

export function TabBar({ tabs, activeTab, onSelect }: TabBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
      <nav className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1">
        {tabs.map((tab) => {
          const IconComp = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={`nav-tab-btn ${isActive ? "nav-tab-active" : ""}`}
            >
              <IconComp className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                    isActive ? "bg-indigo-700 text-indigo-100" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
