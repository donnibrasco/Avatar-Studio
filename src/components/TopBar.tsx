import React from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { WorkspaceTab } from '../types/studio';
import { Download } from 'lucide-react';

const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: 'avatars', label: 'Avatars' },
  { id: 'voices', label: 'Voices' },
  { id: 'script', label: 'Script' },
  { id: 'timeline', label: 'Timeline' },
];

export const TopBar: React.FC = () => {
  const activeTab = useStudioStore((s) => s.activeTab);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const setShowExportModal = useStudioStore((s) => s.setShowExportModal);

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0B0F19] border-b border-slate-800/80 shrink-0">
      {/* Zone 1: Single text element wordmark */}
      <a
        href="#timeline"
        onClick={(e) => {
          e.preventDefault();
          setActiveTab('timeline');
        }}
        className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 font-display focus-visible:outline-2 focus-visible:outline-indigo-500 rounded"
      >
        AvatarStudio
      </a>

      {/* Zone 2: 4 concise single-line text navigation links */}
      <nav
        aria-label="Primary Workspace Navigation"
        className="flex items-center gap-7 text-sm font-medium"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                isActive
                  ? 'text-white border-indigo-400 font-semibold'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={() => setShowExportModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-indigo-400 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Export Video</span>
        </button>
      </div>
    </header>
  );
};
