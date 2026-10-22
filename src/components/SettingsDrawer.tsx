import React, { useState } from 'react';
import { X, Server, Key, Check, AlertCircle, RefreshCw, Info } from 'lucide-react';
import { SettingsState } from '../types';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsState;
  onSave: (newSettings: SettingsState) => void;
  onTestConnection: (url: string, token: string) => Promise<void>;
  isTesting: boolean;
  testError: string | null;
  testSuccess: string | null;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  onTestConnection,
  isTesting,
  testError,
  testSuccess,
}) => {
  const [url, setUrl] = useState(settings.mcpUrl);
  const [token, setToken] = useState(settings.bearerToken);

  if (!isOpen) return null;

  const handleApply = () => {
    onSave({ mcpUrl: url, bearerToken: token });
    onClose();
  };

  const handleTest = async () => {
    await onTestConnection(url, token);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#0B0D10]/80 flex justify-end transition-opacity duration-150">
      <div className="w-full max-w-md bg-[#12151A] border-l border-[#232830] h-full p-6 flex flex-col overflow-y-auto transition-colors duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-[#232830]">
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-amber-500" />
            <h2 className="text-[16px] font-semibold text-[#E8EAED]">
              Connection Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-[10px] hover:bg-[#171B21] text-[#8A919C] hover:text-[#E8EAED] transition-colors duration-150 min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="my-5 p-4 rounded-[10px] bg-[#171B21] border border-[#232830] text-[#8A919C] text-[12px] leading-relaxed flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-[#E8EAED] block mb-0.5">In-Memory Security Rule</span>
            Credentials and endpoints entered here are stored in memory only. They are never written to disk, cookies, or git commits.
          </div>
        </div>

        <div className="space-y-5 flex-1">
          <div>
            <label className="block text-[12px] font-medium text-[#E8EAED] mb-2">
              MCP Server Endpoint (Streamable HTTP / Lambda URL)
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. https://abc123xyz.execute-api.us-east-1.amazonaws.com/mcp"
              className="w-full px-3.5 py-2.5 text-[13px] font-mono bg-[#0B0D10] border border-[#232830] rounded-[10px] text-[#E8EAED] placeholder-[#8A919C] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors duration-150 min-h-[44px]"
            />
            <p className="text-[12px] text-[#8A919C] mt-1.5">
              AWS SAM outputs this as <code className="text-[#E8EAED] font-mono">McpUrl</code>. For local server, use <code className="text-[#E8EAED] font-mono">http://localhost:8000/mcp</code>.
            </p>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#E8EAED] mb-2">
              Bearer Token (Cognito JWT or DEV_STATIC_TOKEN)
            </label>
            <div className="relative">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter Bearer token or DEV_STATIC_TOKEN"
                className="w-full px-3.5 py-2.5 pr-10 text-[13px] font-mono bg-[#0B0D10] border border-[#232830] rounded-[10px] text-[#E8EAED] placeholder-[#8A919C] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors duration-150 min-h-[44px]"
              />
              <Key className="w-4 h-4 text-[#8A919C] absolute right-3 top-3.5 pointer-events-none" />
            </div>
            <p className="text-[12px] text-[#8A919C] mt-1.5">
              Required for authenticated requests. Unauthenticated requests receive HTTP 401.
            </p>
          </div>

          <div className="pt-1">
            <button
              onClick={handleTest}
              disabled={isTesting || !url.trim()}
              className="w-full py-2.5 px-4 text-[13px] font-medium bg-[#171B21] hover:bg-[#232830] text-[#E8EAED] rounded-[10px] border border-[#232830] transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                  <span>Testing MCP Handshake (Spec 2025-11-25)...</span>
                </>
              ) : (
                <span>Test Handshake & Fetch Tools</span>
              )}
            </button>
          </div>

          {testSuccess && (
            <div className="p-4 rounded-[10px] bg-[#171B21] border border-[#3DDC97]/40 text-[#3DDC97] text-[12px]">
              <div className="flex items-center gap-2 font-semibold mb-1.5 text-[#3DDC97]">
                <Check className="w-4 h-4 text-[#3DDC97]" />
                <span>Handshake Succeeded</span>
              </div>
              <div className="font-mono text-[12px] text-[#E8EAED] whitespace-pre-wrap leading-relaxed">
                {testSuccess}
              </div>
            </div>
          )}

          {testError && (
            <div className="p-4 rounded-[10px] bg-[#171B21] border border-[#FF6B6B]/40 text-[#FF6B6B] text-[12px]">
              <div className="flex items-center gap-2 font-semibold mb-1.5 text-[#FF6B6B]">
                <AlertCircle className="w-4 h-4 text-[#FF6B6B]" />
                <span>Handshake Failed</span>
              </div>
              <div className="font-mono text-[12px] text-[#E8EAED] whitespace-pre-wrap leading-relaxed">
                {testError}
              </div>
            </div>
          )}
        </div>

        <div className="pt-5 border-t border-[#232830] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-[13px] font-medium text-[#8A919C] hover:text-[#E8EAED] rounded-[10px] hover:bg-[#171B21] transition-colors duration-150 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2.5 text-[13px] font-semibold bg-amber-500 hover:bg-amber-400 text-[#0B0D10] rounded-[10px] transition-colors duration-150 min-h-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Save & Connect
          </button>
        </div>
      </div>
    </div>
  );
};
