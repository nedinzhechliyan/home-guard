/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  McpTool,
  SmartDevice,
  SetGroupStateResult,
  NaiveResult,
  ScheduleActionResult,
  LedgerEntry,
  ToolExecutionLog,
  ParsedCommand,
  SettingsState,
} from './types';
import { McpClient } from './services/mcpClient';
import { parseVoiceCommand } from './utils/commandParser';
import { TopBar } from './components/TopBar';
import { ErrorBanner } from './components/ErrorBanner';
import { DeviceGrid } from './components/DeviceGrid';
import { ParsedArgumentsCard } from './components/ParsedArgumentsCard';
import { NaiveColumn } from './components/NaiveColumn';
import { HomeGuardColumn } from './components/HomeGuardColumn';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Shield, Sparkles, Terminal, Info } from 'lucide-react';

export default function App() {
  // In-memory settings state (never written to local storage or disk)
  const [settings, setSettings] = useState<SettingsState>({
    mcpUrl: '',
    bearerToken: '',
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'error'
  >('disconnected');
  const [tools, setTools] = useState<McpTool[]>([]);
  const [devices, setDevices] = useState<SmartDevice[]>([]);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [handshakeLatencyMs, setHandshakeLatencyMs] = useState<number | undefined>(undefined);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  // Command & parsing state
  const [inputText, setInputText] = useState('turn on the living room');
  const [parsedCommand, setParsedCommand] = useState<ParsedCommand | null>(() =>
    parseVoiceCommand('turn on the living room')
  );

  // Execution states & results
  const [isExecutingNaive, setIsExecutingNaive] = useState(false);
  const [isExecutingHomeGuard, setIsExecutingHomeGuard] = useState(false);
  const [isConfirmingSchedule, setIsConfirmingSchedule] = useState(false);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  const [lastNaiveResult, setLastNaiveResult] = useState<NaiveResult | null>(null);
  const [lastHomeGuardResult, setLastHomeGuardResult] = useState<SetGroupStateResult | null>(null);
  const [lastScheduleResult, setLastScheduleResult] = useState<ScheduleActionResult | null>(null);
  const [lastLedger, setLastLedger] = useState<LedgerEntry | null>(null);
  const [lastCommandId, setLastCommandId] = useState<string | null>(null);

  // Audit Logs for MCP tool calls
  const [allLogs, setAllLogs] = useState<ToolExecutionLog[]>([]);

  // Testing connection in settings drawer
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);

  // McpClient instance held in ref
  const clientRef = useRef<McpClient>(new McpClient('', ''));

  const appendLog = useCallback((log: ToolExecutionLog) => {
    setAllLogs((prev) => [log, ...prev].slice(0, 100));
  }, []);

  // Sync client when settings change
  useEffect(() => {
    clientRef.current.updateConfig(settings.mcpUrl, settings.bearerToken);
  }, [settings]);

  // Connect & Handshake with real MCP Server
  const connectToServer = useCallback(
    async (targetUrl?: string, targetToken?: string) => {
      const urlToUse = targetUrl !== undefined ? targetUrl : settings.mcpUrl;
      const tokenToUse = targetToken !== undefined ? targetToken : settings.bearerToken;

      if (!urlToUse.trim()) {
        setErrorBanner('No MCP URL configured. Please open Settings and enter your server URL.');
        setConnectionStatus('disconnected');
        return;
      }

      setConnectionStatus('connecting');
      setErrorBanner(null);
      clientRef.current.updateConfig(urlToUse, tokenToUse);

      const startTime = performance.now();

      try {
        // Step 1: initialize (spec 2025-11-25)
        const initRes = await clientRef.current.initialize();
        appendLog({
          id: `init-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          toolName: 'initialize (MCP 2025-11-25)',
          column: 'system',
          requestParams: initRes.rawRequest,
          response: initRes.rawResponse,
          latencyMs: initRes.latencyMs,
          mcpSessionId: initRes.sessionId,
        });

        // Step 2: notifications/initialized
        await clientRef.current.notifyInitialized();

        // Step 3: tools/list
        const toolsRes = await clientRef.current.listTools();
        const discoveredTools = toolsRes.result?.tools || [];
        setTools(discoveredTools);

        appendLog({
          id: `tools-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          toolName: 'tools/list',
          column: 'system',
          requestParams: toolsRes.rawRequest,
          response: toolsRes.rawResponse,
          latencyMs: toolsRes.latencyMs,
          mcpSessionId: toolsRes.sessionId,
        });

        const totalHandshakeTime = Math.round(performance.now() - startTime);
        setHandshakeLatencyMs(totalHandshakeTime);
        setConnectionStatus('connected');

        // Immediately fetch real devices from provider
        await fetchLiveDevices();
      } catch (err: any) {
        setConnectionStatus('error');
        setTools([]);
        setErrorBanner(err.message || 'Connection to MCP server failed.');
        appendLog({
          id: `err-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          toolName: 'handshake',
          column: 'system',
          requestParams: { url: urlToUse },
          response: null,
          latencyMs: Math.round(performance.now() - startTime),
          error: err.message || 'Handshake failed',
        });
      }
    },
    [settings, appendLog]
  );

  // Fetch verified devices using real list_devices tool
  const fetchLiveDevices = useCallback(async () => {
    if (!clientRef.current) return;
    setIsLoadingDevices(true);

    try {
      const callRes = await clientRef.current.callTool<{ devices?: SmartDevice[] } | SmartDevice[]>(
        'list_devices',
        {}
      );

      let fetchedDevices: SmartDevice[] = [];
      if (Array.isArray(callRes.result)) {
        fetchedDevices = callRes.result;
      } else if (callRes.result && Array.isArray((callRes.result as any).devices)) {
        fetchedDevices = (callRes.result as any).devices;
      }

      setDevices(fetchedDevices);
      setLastRefreshedAt(new Date().toLocaleTimeString());

      appendLog({
        id: `dev-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        toolName: 'list_devices',
        column: 'system',
        requestParams: callRes.rawRequest,
        response: callRes.rawResponse,
        latencyMs: callRes.latencyMs,
        mcpSessionId: callRes.sessionId,
      });
    } catch (err: any) {
      setErrorBanner(`list_devices failed: ${err.message}`);
      appendLog({
        id: `dev-err-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        toolName: 'list_devices',
        column: 'system',
        requestParams: { name: 'list_devices' },
        response: null,
        latencyMs: 0,
        error: err.message,
      });
    } finally {
      setIsLoadingDevices(false);
    }
  }, [appendLog]);

  // Periodic device refresh every 10 seconds when connected
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    const interval = setInterval(() => {
      fetchLiveDevices();
    }, 10000);
    return () => clearInterval(interval);
  }, [connectionStatus, fetchLiveDevices]);

  // Handle Command Submission from text or mic
  const handleCommandSubmit = (text: string) => {
    const parsed = parseVoiceCommand(text);
    setParsedCommand(parsed);
  };

  // Naive Execution (Control)
  const executeNaive = async () => {
    if (!parsedCommand) return;
    setIsExecutingNaive(true);

    const targetState = parsedCommand.action === 'on';

    try {
      const callRes = await clientRef.current.callTool<NaiveResult>(
        'naive_set_group_state',
        {
          target: parsedCommand.target,
          state: targetState,
        }
      );

      setLastNaiveResult(callRes.result);

      appendLog({
        id: `naive-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        toolName: 'naive_set_group_state',
        column: 'naive',
        requestParams: callRes.rawRequest,
        response: callRes.rawResponse,
        latencyMs: callRes.latencyMs,
        mcpSessionId: callRes.sessionId,
      });

      // Crucial: immediately list_devices to reveal any gap between assistant's "Done!" and reality
      await fetchLiveDevices();
    } catch (err: any) {
      setErrorBanner(`Naive execution failed: ${err.message}`);
      appendLog({
        id: `naive-err-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        toolName: 'naive_set_group_state',
        column: 'naive',
        requestParams: { target: parsedCommand.target, state: targetState },
        response: null,
        latencyMs: 0,
        error: err.message,
      });
    } finally {
      setIsExecutingNaive(false);
    }
  };

  // Home Guard Execution (Command Contract)
  const executeHomeGuard = async () => {
    if (!parsedCommand) return;
    setIsExecutingHomeGuard(true);

    const targetState = parsedCommand.action === 'on';

    try {
      if (parsedCommand.isSchedule) {
        // schedule_action tool call
        const callRes = await clientRef.current.callTool<ScheduleActionResult>(
          'schedule_action',
          {
            target: parsedCommand.target,
            state: targetState,
            when_iso: parsedCommand.when_iso,
            recurrence: parsedCommand.recurrence,
            user_said_recurring: parsedCommand.user_said_recurring,
            confirmed: false,
          }
        );

        setLastScheduleResult(callRes.result);

        appendLog({
          id: `sched-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          toolName: 'schedule_action',
          column: 'homeguard',
          requestParams: callRes.rawRequest,
          response: callRes.rawResponse,
          latencyMs: callRes.latencyMs,
          mcpSessionId: callRes.sessionId,
        });
      } else {
        // Immediate set_group_state with generated command_id
        const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setLastCommandId(commandId);

        const callRes = await clientRef.current.callTool<SetGroupStateResult>(
          'set_group_state',
          {
            target: parsedCommand.target,
            state: targetState,
            command_id: commandId,
          }
        );

        setLastHomeGuardResult(callRes.result);

        appendLog({
          id: `hg-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          toolName: 'set_group_state',
          column: 'homeguard',
          requestParams: callRes.rawRequest,
          response: callRes.rawResponse,
          latencyMs: callRes.latencyMs,
          mcpSessionId: callRes.sessionId,
        });

        // Refresh devices to reflect verified state
        await fetchLiveDevices();

        // Fetch ledger entry from DynamoDB
        await fetchLedger(commandId);
      }
    } catch (err: any) {
      setErrorBanner(`Home Guard execution failed: ${err.message}`);
      appendLog({
        id: `hg-err-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        toolName: parsedCommand.isSchedule ? 'schedule_action' : 'set_group_state',
        column: 'homeguard',
        requestParams: { target: parsedCommand.target, state: targetState },
        response: null,
        latencyMs: 0,
        error: err.message,
      });
    } finally {
      setIsExecutingHomeGuard(false);
    }
  };

  // Confirm schedule_action when needs_confirmation is returned
  const confirmSchedule = async () => {
    if (!lastScheduleResult || !lastScheduleResult.plan_id) return;
    setIsConfirmingSchedule(true);

    try {
      const callRes = await clientRef.current.callTool<ScheduleActionResult>(
        'schedule_action',
        {
          plan_id: lastScheduleResult.plan_id,
          target: lastScheduleResult.target || parsedCommand?.target || 'living room',
          state: lastScheduleResult.state ?? (parsedCommand?.action === 'on'),
          when_iso: lastScheduleResult.when_iso || parsedCommand?.when_iso,
          recurrence: lastScheduleResult.recurrence || parsedCommand?.recurrence || 'once',
          user_said_recurring: lastScheduleResult.user_said_recurring ?? (parsedCommand?.user_said_recurring || false),
          confirmed: true,
        }
      );

      setLastScheduleResult(callRes.result);

      appendLog({
        id: `confirm-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        toolName: 'schedule_action (confirmed)',
        column: 'homeguard',
        requestParams: callRes.rawRequest,
        response: callRes.rawResponse,
        latencyMs: callRes.latencyMs,
        mcpSessionId: callRes.sessionId,
      });
    } catch (err: any) {
      setErrorBanner(`Schedule confirmation failed: ${err.message}`);
    } finally {
      setIsConfirmingSchedule(false);
    }
  };

  const cancelSchedule = () => {
    setLastScheduleResult(null);
  };

  // Idempotency Duplicate Test: re-send same command_id
  const runDuplicateTest = async () => {
    if (!lastCommandId || !parsedCommand) {
      setErrorBanner('No command_id has been executed yet to test idempotency.');
      return;
    }

    setIsExecutingHomeGuard(true);
    const targetState = parsedCommand.action === 'on';

    try {
      const callRes = await clientRef.current.callTool<SetGroupStateResult>(
        'set_group_state',
        {
          target: parsedCommand.target,
          state: targetState,
          command_id: lastCommandId,
        }
      );

      setLastHomeGuardResult(callRes.result);

      appendLog({
        id: `dup-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        toolName: 'set_group_state (duplicate test)',
        column: 'homeguard',
        requestParams: callRes.rawRequest,
        response: callRes.rawResponse,
        latencyMs: callRes.latencyMs,
        mcpSessionId: callRes.sessionId,
      });
    } catch (err: any) {
      setErrorBanner(`Duplicate test failed: ${err.message}`);
    } finally {
      setIsExecutingHomeGuard(false);
    }
  };

  // Fetch DynamoDB Ledger
  const fetchLedger = async (commandId: string) => {
    try {
      const callRes = await clientRef.current.callTool<LedgerEntry>('get_ledger', {
        command_id: commandId,
      });

      setLastLedger(callRes.result);

      appendLog({
        id: `ledger-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        toolName: 'get_ledger',
        column: 'homeguard',
        requestParams: callRes.rawRequest,
        response: callRes.rawResponse,
        latencyMs: callRes.latencyMs,
        mcpSessionId: callRes.sessionId,
      });
    } catch (err: any) {
      // Ledger might take a few milliseconds to write or return
      console.warn('get_ledger warning:', err.message);
    }
  };

  // Copy full session log as JSON
  const copySessionLog = () => {
    const jsonOutput = JSON.stringify(allLogs, null, 2);
    navigator.clipboard.writeText(jsonOutput);
  };

  // Test connection from inside settings drawer
  const handleTestConnectionInSettings = async (url: string, token: string) => {
    setIsTestingConnection(true);
    setTestError(null);
    setTestSuccess(null);

    const testClient = new McpClient(url, token);
    const startTime = performance.now();

    try {
      const initRes = await testClient.initialize();
      await testClient.notifyInitialized();
      const toolsRes = await testClient.listTools();
      const duration = Math.round(performance.now() - startTime);

      const toolNames = (toolsRes.result?.tools || []).map((t) => t.name).join(', ');
      setTestSuccess(
        `Connected in ${duration}ms!\nServer: ${initRes.result.serverInfo.name} v${initRes.result.serverInfo.version}\nTools discovered: ${toolNames || 'None'}`
      );
    } catch (err: any) {
      setTestError(err.message || 'Connection test failed.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Filter logs for columns
  const naiveLogs = allLogs.filter((l) => l.column === 'naive');
  const homeGuardLogs = allLogs.filter((l) => l.column === 'homeguard');

  // Filter devices belonging to target group for reality comparison
  const targetFilterNormalized = (parsedCommand?.target || '').toLowerCase().trim();
  const targetGroupDevices = devices.filter((d) => {
    const groupLower = (d.group || '').toLowerCase();
    const nameLower = (d.name || '').toLowerCase();
    if (!targetFilterNormalized || targetFilterNormalized === 'all lights' || targetFilterNormalized === 'all') {
      return true;
    }
    return (
      groupLower.includes(targetFilterNormalized) ||
      targetFilterNormalized.includes(groupLower) ||
      nameLower.includes(targetFilterNormalized)
    );
  });

  return (
    <div className="min-h-screen bg-[#0B0D10] text-[#E8EAED] flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-300">
      {/* Top Header & Voice Input Bar */}
      <TopBar
        inputText={inputText}
        onInputChange={setInputText}
        onSubmit={handleCommandSubmit}
        status={connectionStatus}
        tools={tools}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onReconnect={() => connectToServer()}
        onCopySessionLog={copySessionLog}
        hasLogs={allLogs.length > 0}
        latencyMs={handshakeLatencyMs}
      />

      {/* Real Error Banner on failure */}
      <ErrorBanner
        error={errorBanner}
        onClear={() => setErrorBanner(null)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Workspace: 1280px max-width, 32px section rhythm */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Connection Onboarding Callout if Disconnected */}
        {connectionStatus === 'disconnected' && (
          <div className="p-6 rounded-[14px] border border-[#232830] bg-[#12151A] text-[#E8EAED] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors duration-150">
            <div className="flex items-start gap-3.5">
              <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-[16px] font-semibold text-[#E8EAED]">
                  Ready to connect to Home Guard MCP Server
                </h3>
                <p className="text-[12px] text-[#8A919C] mt-1 leading-normal max-w-xl">
                  Enter your deployed AWS Serverless MCP endpoint or local server in Settings to begin executing verified household contracts.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-4 py-2 text-[12px] font-semibold bg-amber-500 hover:bg-amber-400 text-[#0B0D10] rounded-[10px] transition-colors duration-150 shrink-0 min-h-[40px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              Configure Endpoint
            </button>
          </div>
        )}

        {/* Real Device Telemetry Grid from list_devices */}
        <DeviceGrid
          devices={devices}
          isLoading={isLoadingDevices}
          onRefresh={fetchLiveDevices}
          lastRefreshedAt={lastRefreshedAt}
        />

        {/* Parsed Command Arguments Preview */}
        <ParsedArgumentsCard
          parsed={parsedCommand}
          onExecuteNaive={executeNaive}
          onExecuteHomeGuard={executeHomeGuard}
          isExecuting={isExecutingNaive || isExecutingHomeGuard}
        />

        {/* Two-Column Comparison View: Stack under 900px, 32px gap */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {/* LEFT: Naive Execution (Control) */}
          <NaiveColumn
            logs={naiveLogs}
            lastNaiveResult={lastNaiveResult}
            targetDevices={targetGroupDevices.length > 0 ? targetGroupDevices : devices}
            targetGroup={parsedCommand?.target || 'living room'}
            expectedState={parsedCommand?.action === 'on'}
            isLoading={isExecutingNaive}
            onExecute={executeNaive}
          />

          {/* RIGHT: Home Guard (Command Contract) */}
          <HomeGuardColumn
            logs={homeGuardLogs}
            lastResult={lastHomeGuardResult}
            lastScheduleResult={lastScheduleResult}
            lastLedger={lastLedger}
            isLoading={isExecutingHomeGuard}
            isConfirming={isConfirmingSchedule}
            onExecute={executeHomeGuard}
            onConfirmSchedule={confirmSchedule}
            onCancelSchedule={cancelSchedule}
            onDuplicateTest={runDuplicateTest}
            onFetchLedger={fetchLedger}
          />
        </div>
      </main>

      {/* Settings Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={(newSettings) => {
          setSettings(newSettings);
          connectToServer(newSettings.mcpUrl, newSettings.bearerToken);
        }}
        onTestConnection={handleTestConnectionInSettings}
        isTesting={isTestingConnection}
        testError={testError}
        testSuccess={testSuccess}
      />
    </div>
  );
}
