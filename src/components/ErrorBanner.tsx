import React from 'react';
import { AlertTriangle, X, Settings } from 'lucide-react';

interface ErrorBannerProps {
  error: string | null;
  onClear: () => void;
  onOpenSettings: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  error,
  onClear,
  onOpenSettings,
}) => {
  if (!error) return null;

  return (
    <div className="w-full bg-[#171B21] border-b border-[#FF6B6B]/40 px-4 py-3 text-[#E8EAED] transition-colors duration-150">
      <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[14px]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-[#FF6B6B] shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-[#E8EAED] flex items-center gap-2">
              <span className="text-[#FF6B6B]">MCP Offline</span>
              <span className="text-[#8A919C] font-normal text-[12px]">· Real connection failure</span>
            </div>
            <div className="text-[12px] font-mono text-[#E8EAED] mt-1 break-all">
              {error}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium bg-[#12151A] hover:bg-[#232830] text-[#E8EAED] rounded-[10px] border border-[#232830] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 min-h-[36px]"
          >
            <Settings className="w-3.5 h-3.5 text-[#8A919C]" />
            <span>Check Settings</span>
          </button>
          <button
            onClick={onClear}
            className="p-2 hover:bg-[#232830] rounded-[10px] text-[#8A919C] hover:text-[#E8EAED] transition-colors duration-150 min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            aria-label="Dismiss error banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
