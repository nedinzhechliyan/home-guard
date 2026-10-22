import React from 'react';
import { ParsedCommand } from '../types';
import { Sliders, Calendar, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

interface ParsedArgumentsCardProps {
  parsed: ParsedCommand | null;
  onExecuteNaive: () => void;
  onExecuteHomeGuard: () => void;
  isExecuting: boolean;
}

export const ParsedArgumentsCard: React.FC<ParsedArgumentsCardProps> = ({
  parsed,
  onExecuteNaive,
  onExecuteHomeGuard,
  isExecuting,
}) => {
  if (!parsed) return null;

  const stateBool = parsed.action === 'on';
  const effectiveRecurrence =
    parsed.recurrence !== 'once' && !parsed.user_said_recurring
      ? 'once (Rule 5: forced to once because user did not explicitly state recurrence)'
      : parsed.recurrence;

  return (
    <div className="border border-[#232830] bg-[#12151A] rounded-[14px] p-6 transition-colors duration-150">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-amber-500 shrink-0" />
          <h3 className="text-[12px] font-mono uppercase tracking-[0.08em] font-semibold text-[#8A919C]">
            Parsed Command Arguments
          </h3>
          <span className="text-[#232830]">·</span>
          <span className="text-[12px] text-[#8A919C] italic truncate max-w-sm">
            "{parsed.rawText}"
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onExecuteNaive}
            disabled={isExecuting}
            className="px-3.5 py-1.5 text-[12px] font-medium bg-[#171B21] hover:bg-[#232830] text-[#E8EAED] rounded-[10px] border border-[#232830] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Run Left (Naive Control)
          </button>
          <button
            onClick={onExecuteHomeGuard}
            disabled={isExecuting}
            className="flex items-center justify-center gap-2 px-4 py-1.5 text-[12px] font-semibold bg-amber-500 hover:bg-amber-400 text-[#0B0D10] rounded-[10px] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Run Right (Home Guard)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
        <div className="p-3.5 rounded-[10px] bg-[#171B21] border border-[#232830]">
          <span className="text-[12px] text-[#8A919C] block mb-1">Target Group/Device</span>
          <span className="font-mono font-medium text-[#E8EAED] text-[14px]">
            {parsed.target}
          </span>
        </div>

        <div className="p-3.5 rounded-[10px] bg-[#171B21] border border-[#232830]">
          <span className="text-[12px] text-[#8A919C] block mb-1">Requested State</span>
          <span className={`font-mono font-semibold text-[14px] ${stateBool ? 'text-amber-500' : 'text-[#8A919C]'}`}>
            state: {String(stateBool)} ({parsed.action.toUpperCase()})
          </span>
        </div>

        <div className="p-3.5 rounded-[10px] bg-[#171B21] border border-[#232830]">
          <span className="text-[12px] text-[#8A919C] block mb-1">Schedule Mode</span>
          <span className="font-mono text-[#E8EAED] text-[14px]">
            {parsed.isSchedule ? parsed.timeText || 'Timed' : 'Immediate execution'}
          </span>
        </div>

        <div className="p-3.5 rounded-[10px] bg-[#171B21] border border-[#232830]">
          <span className="text-[12px] text-[#8A919C] block mb-1">Recurrence Intent</span>
          <span className="font-mono text-[#E8EAED] text-[14px]">
            {parsed.user_said_recurring ? (
              <span className="text-[#3DDC97]">Explicit ({parsed.recurrence})</span>
            ) : (
              <span className="text-[#8A919C]">One-time (user_said_recurring: false)</span>
            )}
          </span>
        </div>
      </div>

      {parsed.isSchedule && (
        <div className="mt-3.5 pt-3 border-t border-[#232830] flex flex-wrap items-center gap-2 text-[12px] text-[#8A919C] font-mono">
          <Calendar className="w-3.5 h-3.5 text-[#8A919C]" />
          <span>when_iso:</span>
          <span className="text-amber-500 font-mono text-[12px]">
            {parsed.when_iso}
          </span>
          <span className="text-[#232830]">·</span>
          <span>recurrence: {effectiveRecurrence}</span>
        </div>
      )}
    </div>
  );
};
