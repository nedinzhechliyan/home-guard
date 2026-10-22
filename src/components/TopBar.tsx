import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Settings,
  Copy,
  Radio,
  Check,
  Search,
  Sparkles,
} from 'lucide-react';
import { ConnectionBadge } from './ConnectionBadge';
import { McpTool } from '../types';

interface TopBarProps {
  inputText: string;
  onInputChange: (val: string) => void;
  onSubmit: (text: string) => void;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  tools: McpTool[];
  onOpenSettings: () => void;
  onReconnect: () => void;
  onCopySessionLog: () => void;
  hasLogs: boolean;
  latencyMs?: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  inputText,
  onInputChange,
  onSubmit,
  status,
  tools,
  onOpenSettings,
  onReconnect,
  onCopySessionLog,
  hasLogs,
  latencyMs,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [copiedLog, setCopiedLog] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize Web Speech API if supported
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          onInputChange(transcript);
          onSubmit(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        setSpeechError(`Speech error: ${event.error || 'could not capture'}`);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [onInputChange, onSubmit]);

  const toggleMic = () => {
    if (!recognitionRef.current) {
      setSpeechError('Web Speech API is not supported in this browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        setSpeechError(null);
        recognitionRef.current.start();
      } catch (err: any) {
        setSpeechError(err?.message || 'Could not access microphone');
      }
    }
  };

  const handleCopyLogs = () => {
    onCopySessionLog();
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  const quickPhrases = [
    'turn on the living room',
    'turn off the living room',
    'turn on porch light at 8pm today',
    'turn on kitchen lights at 7am tomorrow every day',
    'turn off all lights',
  ];

  return (
    <header className="border-b border-[#232830] bg-[#12151A] sticky top-0 z-30 transition-colors duration-150">
      {/* Top tier brand row */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Brand Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-[10px] bg-[#171B21] border border-[#232830] flex items-center justify-center text-amber-500 shrink-0">
            <Radio className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-bold tracking-tight text-[#E8EAED]">
                Home Guard
              </span>
              <span className="text-[#232830]">·</span>
              <span className="text-[12px] font-mono tracking-wider text-amber-500 bg-[#171B21] px-2 py-0.5 rounded-[6px] border border-[#232830]">
                MCP 2025-11-25
              </span>
            </div>
            <div className="text-[12px] text-[#8A919C] font-normal leading-normal">
              Alexa+-style voice console (client-side simulation of the Alexa+ side only; server and devices are real)
            </div>
          </div>
        </div>

        {/* Status and Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <ConnectionBadge
            status={status}
            tools={tools}
            onReconnect={onReconnect}
            latencyMs={latencyMs}
          />

          <button
            onClick={handleCopyLogs}
            disabled={!hasLogs}
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium bg-[#171B21] hover:bg-[#232830] text-[#E8EAED] rounded-[10px] border border-[#232830] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            title="Copy entire session log as JSON"
          >
            {copiedLog ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#3DDC97]" />
                <span className="text-[#3DDC97]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#8A919C]" />
                <span>Copy Session Log</span>
              </>
            )}
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium bg-[#171B21] hover:bg-[#232830] text-[#E8EAED] rounded-[10px] border border-[#232830] transition-colors duration-150 min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <Settings className="w-3.5 h-3.5 text-[#8A919C]" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Voice & Text Command Input Bar */}
      <div className="border-t border-[#232830] bg-[#0B0D10] px-4 sm:px-6 py-3">
        <div className="max-w-[1280px] mx-auto">
          {/* Prominent aligned command row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (inputText.trim()) onSubmit(inputText);
              }}
              className="relative flex-1"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => onInputChange(e.target.value)}
                placeholder='Speak or type household command: e.g. "turn on the living room" or "turn on kitchen at 8pm tomorrow"'
                className="w-full pl-10 pr-24 py-2.5 text-[14px] font-normal bg-[#12151A] border border-[#232830] rounded-[10px] text-[#E8EAED] placeholder-[#8A919C] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors duration-150 min-h-[44px]"
              />
              <Search className="w-4 h-4 text-[#8A919C] absolute left-3.5 top-3.5 pointer-events-none" />

              <button
                type="submit"
                className="absolute right-1.5 top-1.5 px-4 py-1.5 text-[12px] font-semibold bg-amber-500 hover:bg-amber-400 text-[#0B0D10] rounded-[8px] transition-colors duration-150 min-h-[32px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Parse
              </button>
            </form>

            {/* Microphone button */}
            <button
              type="button"
              onClick={toggleMic}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 text-[14px] font-medium rounded-[10px] border transition-colors duration-150 shrink-0 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                isListening
                  ? 'bg-[#FF6B6B] text-[#0B0D10] border-[#FF6B6B] font-semibold'
                  : 'bg-[#12151A] hover:bg-[#171B21] text-[#E8EAED] border-[#232830]'
              }`}
              title={isListening ? 'Click to stop listening' : 'Click to speak via Web Speech API'}
            >
              {isListening ? (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Listening...</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 text-amber-500" />
                  <span>Mic (Voice)</span>
                </>
              )}
            </button>
          </div>

          {/* Quick suggestions row */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-1 text-[12px] text-[#8A919C]">
            <span className="text-[12px] text-[#8A919C] flex items-center gap-1.5 shrink-0 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Quick phrases:
            </span>
            {quickPhrases.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => {
                  onInputChange(phrase);
                  onSubmit(phrase);
                }}
                className="px-2.5 py-1 rounded-[8px] text-[12px] font-mono bg-[#12151A] hover:bg-[#171B21] border border-[#232830] text-[#E8EAED] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                {phrase}
              </button>
            ))}
          </div>

          {speechError && (
            <div className="mt-2 text-[12px] text-[#FF6B6B] font-mono">
              {speechError}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
