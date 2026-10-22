import React from 'react';
import { NaiveResult, SmartDevice, ToolExecutionLog } from '../types';
import { ToolCallChip } from './ToolCallChip';
import { AlertCircle, HelpCircle, Bot, ZapOff } from 'lucide-react';

interface NaiveColumnProps {
  logs: ToolExecutionLog[];
  lastNaiveResult: NaiveResult | null;
  targetDevices: SmartDevice[];
  targetGroup: string;
  expectedState: boolean;
  isLoading: boolean;
  onExecute: () => void;
}

export const NaiveColumn: React.FC<NaiveColumnProps> = ({
  logs,
  lastNaiveResult,
  targetDevices,
  targetGroup,
  expectedState,
  isLoading,
  onExecute,
}) => {
  // Calculate real verified states for the target devices
  const totalTargetDevices = targetDevices.length;
  const verifiedMatchCount = targetDevices.filter(
    (d) => d.online && d.on === expectedState
  ).length;
  const offlineCount = targetDevices.filter((d) => !d.online).length;
  const failedMismatchCount = targetDevices.filter(
    (d) => d.online && d.on !== expectedState
  ).length;

  const hasGap =
    lastNaiveResult &&
    (failedMismatchCount > 0 || offlineCount > 0 || (totalTargetDevices > 0 && verifiedMatchCount < totalTargetDevices));

  return (
    <div className="border border-[#232830] bg-[#12151A] rounded-[14px] p-6 flex flex-col h-full transition-colors duration-150">
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#232830]">
        <div>
          <div className="flex items-center gap-2">
            <ZapOff className="w-4 h-4 text-[#8A919C]" />
            <h2 className="text-[16px] font-bold text-[#E8EAED]">
              Naive Execution (Control)
            </h2>
          </div>
          <p className="text-[12px] text-[#8A919C] mt-1 leading-normal">
            Simulates standard voice assistant behavior: fire-and-forget without verification
          </p>
        </div>

        <button
          onClick={onExecute}
          disabled={isLoading}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-[#171B21] hover:bg-[#232830] text-[#E8EAED] rounded-[10px] border border-[#232830] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 min-h-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {isLoading ? 'Executing...' : 'Run Naive'}
        </button>
      </div>

      <div className="space-y-4 my-5 flex-1">
        {/* Assistant Response vs Reality Box */}
        {lastNaiveResult ? (
          <div className="space-y-3.5">
            <div className="p-4 rounded-[10px] bg-[#171B21] border border-[#232830]">
              <div className="flex items-center gap-2 text-[12px] text-[#8A919C] mb-1.5">
                <Bot className="w-4 h-4 text-[#8A919C]" />
                <span className="font-semibold text-[#E8EAED]">Assistant Response:</span>
              </div>
              <div className="text-[14px] font-medium text-[#E8EAED] pl-6 font-mono">
                "{lastNaiveResult.message}"
              </div>
            </div>

            {/* Reality Comparison */}
            <div
              className={`p-4 rounded-[10px] border transition-colors duration-150 ${
                hasGap
                  ? 'bg-[#171B21] border-[#FF6B6B]/40'
                  : 'bg-[#171B21] border-[#232830]'
              }`}
            >
              <div className="flex items-center justify-between text-[12px] mb-3">
                <span className="font-semibold text-[#E8EAED]">
                  Real Hardware Verification
                </span>
                {hasGap ? (
                  <span className="text-[#FF6B6B] font-mono text-[12px] font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-[#FF6B6B]" />
                    Reliability Gap Detected
                  </span>
                ) : (
                  <span className="text-[#3DDC97] font-mono text-[12px]">
                    All devices matched
                  </span>
                )}
              </div>

              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between items-center text-[#8A919C]">
                  <span>Target Scope:</span>
                  <span className="font-mono text-[#E8EAED]">
                    "{targetGroup}" ({totalTargetDevices} {totalTargetDevices === 1 ? 'device' : 'devices'})
                  </span>
                </div>
                <div className="flex justify-between items-center text-[#8A919C]">
                  <span>Assistant claimed:</span>
                  <span className="font-mono text-[#3DDC97]">
                    100% Complete ("Done!")
                  </span>
                </div>
                <div className="flex justify-between items-center text-[#8A919C]">
                  <span>Actual verified state:</span>
                  <span
                    className={`font-mono font-semibold text-[13px] ${
                      hasGap ? 'text-[#FF6B6B]' : 'text-[#3DDC97]'
                    }`}
                  >
                    {verifiedMatchCount} of {totalTargetDevices} actually {expectedState ? 'ON' : 'OFF'}
                  </span>
                </div>
                {offlineCount > 0 && (
                  <div className="text-[12px] text-[#FF6B6B] pt-2 border-t border-[#232830] font-mono">
                    Warning: {offlineCount} offline device(s) silently failed without alert.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-10 px-6 text-center rounded-[12px] border border-dashed border-[#232830] bg-[#0B0D10]">
            <HelpCircle className="w-6 h-6 text-[#8A919C] mx-auto mb-2" />
            <p className="text-[14px] text-[#E8EAED] font-medium">
              No naive commands executed yet in this session.
            </p>
            <p className="text-[12px] text-[#8A919C] mt-1.5 max-w-sm mx-auto">
              Select or speak a command and click "Run Naive" to benchmark fire-and-forget behavior.
            </p>
          </div>
        )}

        {/* MCP Tool Call Audit Trail */}
        <div className="pt-2">
          <div className="text-[12px] font-mono uppercase tracking-[0.08em] font-semibold text-[#8A919C] mb-2.5">
            Tool Call Logs (Naive)
          </div>
          {logs.length === 0 ? (
            <div className="text-[12px] text-[#8A919C] italic">No tool calls logged</div>
          ) : (
            <div className="space-y-2.5">
              {logs.map((log) => (
                <ToolCallChip key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
