import React from 'react';
import { SmartDevice } from '../types';
import { RefreshCw, Power, Wifi, WifiOff } from 'lucide-react';

interface DeviceGridProps {
  devices: SmartDevice[];
  isLoading: boolean;
  onRefresh: () => void;
  lastRefreshedAt: string | null;
}

export const DeviceGrid: React.FC<DeviceGridProps> = ({
  devices,
  isLoading,
  onRefresh,
  lastRefreshedAt,
}) => {
  return (
    <div className="border border-[#232830] bg-[#12151A] rounded-[14px] p-6 transition-colors duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-semibold text-[#E8EAED]">
            Household Device State
          </h2>
          <span className="text-[#232830]">·</span>
          <span className="text-[12px] text-[#8A919C] font-mono tabular-nums">
            {devices.length} verified {devices.length === 1 ? 'device' : 'devices'}
          </span>
          {lastRefreshedAt && (
            <>
              <span className="text-[#232830]">·</span>
              <span className="text-[12px] text-[#8A919C] font-mono tabular-nums">
                Synced {lastRefreshedAt}
              </span>
            </>
          )}
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 px-3 py-1.5 text-[12px] font-medium text-[#E8EAED] bg-[#171B21] hover:bg-[#232830] rounded-[10px] border border-[#232830] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          title="Poll real state now via list_devices"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-500' : 'text-[#8A919C]'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {devices.length === 0 ? (
        <div className="py-10 px-6 text-center rounded-[12px] border border-dashed border-[#232830] bg-[#0B0D10]">
          <p className="text-[14px] text-[#E8EAED] font-medium">
            No device telemetry loaded yet.
          </p>
          <p className="text-[12px] text-[#8A919C] mt-1.5 max-w-md mx-auto">
            Connect to an MCP server configured with LIFX or Home Assistant provider to view live devices.
          </p>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="mt-4 px-4 py-2 text-[12px] font-medium text-[#E8EAED] bg-[#171B21] hover:bg-[#232830] rounded-[10px] border border-[#232830] transition-colors duration-150 min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Query list_devices
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {devices.map((device) => {
            const isOnline = device.online;
            const isOn = device.on;

            return (
              <div
                key={device.id || device.name}
                className={`p-4 rounded-[12px] border transition-colors duration-150 ${
                  isOnline
                    ? isOn
                      ? 'bg-[#171B21] border-[#232830]'
                      : 'bg-[#12151A] border-[#232830]'
                    : 'bg-[#0B0D10] border-[#232830] opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[#E8EAED] truncate">
                      {device.name}
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-[#8A919C] mt-0.5">
                      <span className="truncate">{device.group || 'Unassigned'}</span>
                      <span aria-hidden="true" className="text-[#232830]">·</span>
                      <span className="font-mono text-[12px] text-[#8A919C] shrink-0">
                        {device.provider || 'device'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isOnline ? (
                      <span
                        title="Device is online and responsive"
                        className="inline-flex items-center gap-1.5"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#3DDC97] shrink-0" aria-hidden="true" />
                        <Wifi className="w-3.5 h-3.5 text-[#3DDC97]" />
                      </span>
                    ) : (
                      <span
                        title="Device is offline / unreachable"
                        className="inline-flex items-center gap-1.5"
                      >
                        <span className="w-2 h-2 rounded-full border border-[#FF6B6B] shrink-0" aria-hidden="true" />
                        <WifiOff className="w-3.5 h-3.5 text-[#FF6B6B]" />
                      </span>
                    )}
                    <span
                      className={`text-[12px] font-medium font-mono ${
                        isOnline ? 'text-[#3DDC97]' : 'text-[#FF6B6B]'
                      }`}
                    >
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>

                <div className="mt-3.5 pt-3 border-t border-[#232830] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isOnline
                          ? isOn
                            ? 'bg-amber-500'
                            : 'bg-[#8A919C]'
                          : 'border border-[#8A919C]'
                      }`}
                      aria-hidden="true"
                    />
                    <Power
                      className={`w-3.5 h-3.5 ${
                        isOn ? 'text-amber-500' : 'text-[#8A919C]'
                      }`}
                    />
                    <span
                      className={`text-[12px] font-semibold uppercase tracking-wider font-mono ${
                        isOn ? 'text-amber-500' : 'text-[#8A919C]'
                      }`}
                    >
                      {isOn ? 'Power ON' : 'Power OFF'}
                    </span>
                  </div>

                  {device.brightness !== undefined && (
                    <span className="text-[12px] text-[#8A919C] font-mono tabular-nums">
                      {Math.round(device.brightness * 100)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
