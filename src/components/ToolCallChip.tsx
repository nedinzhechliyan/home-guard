import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ToolExecutionLog } from '../types';

interface ToolCallChipProps {
  log: ToolExecutionLog;
}

export const ToolCallChip: React.FC<ToolCallChipProps> = ({ log }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isOverBudget = log.latencyMs > 500;
  const isError = Boolean(log.error);

  return (
    <div className="border border-[#232830] bg-[#12151A] rounded-[10px] overflow-hidden transition-colors duration-150">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 hover:bg-[#171B21] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 transition-colors duration-150 min-h-[44px]"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-[#8A919C] shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[#8A919C] shrink-0" />
          )}

          {isError ? (
            <AlertTriangle className="w-4 h-4 text-[#FF6B6B] shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#3DDC97] shrink-0" />
          )}

          <span className="font-mono text-[13px] font-medium text-[#E8EAED] truncate">
            {log.toolName}
          </span>
          <span className="text-[#232830]">·</span>
          <span className="text-[12px] text-[#8A919C] font-mono tabular-nums">
            {log.timestamp}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[12px] font-mono tabular-nums border ${
              isOverBudget
                ? 'bg-[#171B21] text-amber-500 border-amber-500/40'
                : 'bg-[#171B21] text-[#3DDC97] border-[#3DDC97]/40'
            }`}
            title={isOverBudget ? 'Exceeded 500ms round-trip budget' : 'Within 500ms budget'}
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="font-semibold">{log.latencyMs}ms</span>
            <span className="text-[#8A919C] text-[12px]">
              {isOverBudget ? '(>500ms)' : '(≤500ms)'}
            </span>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 border-t border-[#232830] bg-[#171B21] space-y-3.5 text-[12px]">
          {log.error && (
            <div className="p-3 rounded-[8px] bg-[#0B0D10] border border-[#FF6B6B]/40 text-[#FF6B6B] font-mono text-[12px]">
              <span className="font-semibold block mb-1">Execution Error:</span>
              {log.error}
            </div>
          )}

          <div>
            <div className="text-[12px] font-mono uppercase tracking-[0.08em] font-semibold text-[#8A919C] mb-1.5">
              JSON-RPC Request ({log.toolName})
            </div>
            <pre className="p-3 rounded-[8px] bg-[#0B0D10] border border-[#232830] text-[#E8EAED] font-mono text-[12px] overflow-x-auto max-h-60 overflow-y-auto leading-relaxed">
              {JSON.stringify(log.requestParams, null, 2)}
            </pre>
          </div>

          <div>
            <div className="text-[12px] font-mono uppercase tracking-[0.08em] font-semibold text-[#8A919C] mb-1.5">
              Raw Response Payload
            </div>
            <pre className="p-3 rounded-[8px] bg-[#0B0D10] border border-[#232830] text-[#E8EAED] font-mono text-[12px] overflow-x-auto max-h-60 overflow-y-auto leading-relaxed">
              {JSON.stringify(log.response, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
