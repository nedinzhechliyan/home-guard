import React from 'react';
import { McpTool } from '../types';
import { Radio, AlertCircle, RefreshCw } from 'lucide-react';

interface ConnectionBadgeProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  tools: McpTool[];
  onReconnect: () => void;
  latencyMs?: number;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({
  status,
  tools,
  onReconnect,
  latencyMs,
}) => {
  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[#8A919C]">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
        <span>Initializing MCP 2025-11-25...</span>
      </div>
    );
  }

  if (status === 'connected') {
    return (
      <div className="flex flex-wrap items-center gap-2.5 text-[12px]">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[10px] bg-[#12151A] border border-[#232830] text-[#E8EAED] font-medium transition-colors duration-150">
          <span className="w-2 h-2 rounded-full bg-[#3DDC97] shrink-0" aria-hidden="true" />
          <Radio className="w-3.5 h-3.5 text-[#3DDC97]" />
          <span>Connected</span>
          {latencyMs !== undefined && (
            <span className="text-[#3DDC97] font-mono tabular-nums text-[12px]">
              ({latencyMs}ms)
            </span>
          )}
        </div>

        <div className="hidden lg:flex items-center gap-1.5 text-[#8A919C] font-mono text-[12px]">
          <span className="text-[#8A919C]">Tools:</span>
          {tools.length === 0 ? (
            <span className="text-[#8A919C] italic">None reported</span>
          ) : (
            tools.map((t, idx) => (
              <React.Fragment key={t.name}>
                {idx > 0 && <span className="text-[#232830]">·</span>}
                <span
                  className="hover:text-[#E8EAED] transition-colors duration-150 cursor-help"
                  title={t.description || t.name}
                >
                  {t.name}
                </span>
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-[12px]">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[10px] bg-[#12151A] border border-[#232830] text-[#FF6B6B] font-medium transition-colors duration-150">
          <span className="w-2 h-2 rounded-full bg-[#FF6B6B] shrink-0" aria-hidden="true" />
          <AlertCircle className="w-3.5 h-3.5 text-[#FF6B6B]" />
          <span>MCP Offline</span>
        </div>
        <button
          onClick={onReconnect}
          className="px-3 py-1.5 text-[12px] font-medium rounded-[10px] bg-[#171B21] hover:bg-[#232830] text-[#E8EAED] border border-[#232830] transition-colors duration-150 min-h-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 text-[12px] text-[#8A919C]">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[10px] bg-[#12151A] border border-[#232830] text-[#8A919C]">
        <span className="w-2 h-2 rounded-full bg-[#8A919C] shrink-0" aria-hidden="true" />
        <span className="text-[#8A919C] font-medium">MCP Disconnected</span>
      </div>
      <button
        onClick={onReconnect}
        className="px-3.5 py-1.5 rounded-[10px] bg-[#171B21] hover:bg-[#232830] text-[#E8EAED] border border-[#232830] transition-colors duration-150 text-[12px] font-medium min-h-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        Connect
      </button>
    </div>
  );
};
