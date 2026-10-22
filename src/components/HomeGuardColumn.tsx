import React from 'react';
import {
  SetGroupStateResult,
  ScheduleActionResult,
  LedgerEntry,
  ToolExecutionLog,
} from '../types';
import { ToolCallChip } from './ToolCallChip';
import {
  ShieldCheck,
  CheckCircle2,
  Copy,
  Clock,
  RotateCw,
  CalendarCheck,
  Check,
  Ban,
  FileText,
} from 'lucide-react';

interface HomeGuardColumnProps {
  logs: ToolExecutionLog[];
  lastResult: SetGroupStateResult | null;
  lastScheduleResult: ScheduleActionResult | null;
  lastLedger: LedgerEntry | null;
  isLoading: boolean;
  isConfirming: boolean;
  onExecute: () => void;
  onConfirmSchedule: () => void;
  onCancelSchedule: () => void;
  onDuplicateTest: () => void;
  onFetchLedger: (commandId: string) => void;
}

export const HomeGuardColumn: React.FC<HomeGuardColumnProps> = ({
  logs,
  lastResult,
  lastScheduleResult,
  lastLedger,
  isLoading,
  isConfirming,
  onExecute,
  onConfirmSchedule,
  onCancelSchedule,
  onDuplicateTest,
  onFetchLedger,
}) => {
  return (
    <div className="border border-[#232830] bg-[#12151A] rounded-[14px] p-6 flex flex-col h-full transition-colors duration-150">
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#232830]">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <h2 className="text-[16px] font-bold text-[#E8EAED]">
              Home Guard (Command Contract)
            </h2>
          </div>
          <p className="text-[12px] text-[#8A919C] mt-1 leading-normal">
            Atomicity, real device verification, automatic retry, zero unwanted routines
          </p>
        </div>

        <button
          onClick={onExecute}
          disabled={isLoading}
          className="px-4 py-1.5 text-[12px] font-semibold bg-amber-500 hover:bg-amber-400 text-[#0B0D10] rounded-[10px] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 min-h-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {isLoading ? 'Executing...' : 'Run Home Guard'}
        </button>
      </div>

      <div className="space-y-4 my-5 flex-1">
        {/* Schedule Needs Confirmation Banner */}
        {lastScheduleResult && lastScheduleResult.needs_confirmation && (
          <div className="p-4 rounded-[10px] bg-[#171B21] border border-amber-500/40 text-[#E8EAED] space-y-3">
            <div className="flex items-start gap-3">
              <CalendarCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-[14px] text-[#E8EAED]">
                  Explicit Confirmation Required
                </div>
                <div className="text-[12px] text-amber-500 mt-1 font-mono">
                  {lastScheduleResult.message}
                </div>
                <div className="text-[12px] text-[#8A919C] mt-1">
                  Plan ID: <code className="font-mono text-[#E8EAED]">{lastScheduleResult.plan_id}</code> · Prevents silent routine creation
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-[#232830] justify-end">
              <button
                onClick={onCancelSchedule}
                disabled={isConfirming}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#12151A] hover:bg-[#232830] text-[#E8EAED] rounded-[10px] border border-[#232830] transition-colors duration-150 min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <Ban className="w-3.5 h-3.5 text-[#FF6B6B]" />
                <span>Cancel Plan</span>
              </button>
              <button
                onClick={onConfirmSchedule}
                disabled={isConfirming}
                className="flex items-center gap-2 px-4 py-1.5 text-[12px] font-semibold bg-amber-500 hover:bg-amber-400 text-[#0B0D10] rounded-[10px] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isConfirming ? 'Creating Schedule...' : 'Confirm Schedule'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Schedule Confirmed Success */}
        {lastScheduleResult && lastScheduleResult.confirmed && (
          <div className="p-4 rounded-[10px] bg-[#171B21] border border-[#3DDC97]/40 text-[#E8EAED]">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#E8EAED]">
              <CheckCircle2 className="w-4 h-4 text-[#3DDC97]" />
              <span>EventBridge Schedule Created (Real AWS Serverless)</span>
            </div>
            <div className="text-[12px] font-mono text-[#3DDC97] mt-1.5">
              {lastScheduleResult.message}
            </div>
            {lastScheduleResult.schedule_name && (
              <div className="text-[12px] text-[#8A919C] font-mono mt-1">
                Schedule ARN: {lastScheduleResult.schedule_name}
              </div>
            )}
          </div>
        )}

        {/* Execution Result Box */}
        {lastResult && (
          <div className="p-4 rounded-[10px] bg-[#171B21] border border-[#232830] space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-500" />
                  <span className="text-[12px] font-semibold text-[#E8EAED]">
                    Exact Verified Result:
                  </span>
                </div>
                <div className="text-[14px] font-semibold text-[#E8EAED] font-mono pl-6">
                  "{lastResult.message}"
                </div>
              </div>

              {lastResult.duplicate && (
                <span className="px-2.5 py-1 rounded-[6px] text-[12px] font-mono bg-[#0B0D10] border border-[#232830] text-amber-500 shrink-0">
                  Idempotent Cached
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[12px] pt-3 border-t border-[#232830]">
              <div className="p-2.5 rounded-[8px] bg-[#0B0D10] border border-[#232830]">
                <span className="text-[12px] text-[#8A919C] block mb-0.5">Verified Done</span>
                <span className="font-mono text-[#E8EAED] font-semibold text-[14px]">
                  {lastResult.done} / {lastResult.total}
                </span>
              </div>

              <div className="p-2.5 rounded-[8px] bg-[#0B0D10] border border-[#232830]">
                <span className="text-[12px] text-[#8A919C] block mb-0.5">Unreachable</span>
                <span className="font-mono text-[#8A919C] text-[14px]">
                  {lastResult.not_done.length} devices
                </span>
              </div>

              <div className="p-2.5 rounded-[8px] bg-[#0B0D10] border border-[#232830]">
                <span className="text-[12px] text-[#8A919C] block mb-0.5">Round-Trip</span>
                <span
                  className={`font-mono tabular-nums font-semibold text-[14px] ${
                    lastResult.ms > 500 ? 'text-amber-500' : 'text-[#3DDC97]'
                  }`}
                >
                  {lastResult.ms}ms
                </span>
              </div>

              <div className="p-2.5 rounded-[8px] bg-[#0B0D10] border border-[#232830]">
                <span className="text-[12px] text-[#8A919C] block mb-0.5">Command ID</span>
                <span className="font-mono text-[12px] text-[#E8EAED] truncate block">
                  {lastResult.command_id.slice(0, 10)}...
                </span>
              </div>
            </div>

            {/* Idempotency Test Action */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#232830]">
              <span className="text-[12px] text-[#8A919C]">
                Verify idempotency in DynamoDB conditional write:
              </span>
              <button
                onClick={onDuplicateTest}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#12151A] hover:bg-[#0B0D10] text-amber-500 rounded-[10px] border border-[#232830] transition-colors duration-150 min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                title="Re-send identical command_id to test idempotency"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Duplicate Test</span>
              </button>
            </div>
          </div>
        )}

        {/* Ledger Card for the last command_id */}
        {lastLedger && (
          <div className="p-4 rounded-[10px] bg-[#171B21] border border-[#232830] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#3DDC97]" />
                <h3 className="text-[12px] font-mono uppercase tracking-[0.08em] font-semibold text-[#8A919C]">
                  DynamoDB Reliability Ledger
                </h3>
              </div>
              <button
                onClick={() => onFetchLedger(lastLedger.command_id)}
                className="text-[12px] text-[#8A919C] hover:text-[#E8EAED] flex items-center gap-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded px-1.5 py-0.5"
                title="Refetch record from DynamoDB"
              >
                <RotateCw className="w-3 h-3" />
                <span>Refresh Record</span>
              </button>
            </div>

            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between items-center text-[#8A919C]">
                <span>Command ID:</span>
                <span className="font-mono text-[#E8EAED] text-[12px]">
                  {lastLedger.command_id}
                </span>
              </div>
              <div className="flex justify-between items-center text-[#8A919C]">
                <span>Summary:</span>
                <span className="text-[#E8EAED] font-medium">{lastLedger.summary}</span>
              </div>
              <div className="flex justify-between items-center text-[#8A919C]">
                <span>Planned vs Verified:</span>
                <span className="font-mono text-[#E8EAED]">
                  {lastLedger.verified_on} verified of {lastLedger.planned} planned
                </span>
              </div>
              <div className="flex justify-between items-center text-[#8A919C]">
                <span>Retried Devices:</span>
                <span className="font-mono text-[#E8EAED]">
                  {lastLedger.retried.length > 0 ? lastLedger.retried.join(', ') : 'None needed (0)'}
                </span>
              </div>
              <div className="flex justify-between items-center text-[#8A919C]">
                <span>Routine Created:</span>
                <span className="font-mono text-[#3DDC97] font-semibold">
                  {String(lastLedger.routine_created)} (Never creates stealth routines)
                </span>
              </div>
              <div className="flex justify-between items-center text-[#8A919C]">
                <span>Storage Latency:</span>
                <span className="font-mono tabular-nums text-[#E8EAED]">
                  {lastLedger.ms}ms
                </span>
              </div>
            </div>
          </div>
        )}

        {/* MCP Tool Call Logs */}
        <div className="pt-2">
          <div className="text-[12px] font-mono uppercase tracking-[0.08em] font-semibold text-[#8A919C] mb-2.5">
            Tool Call Logs (Home Guard)
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
