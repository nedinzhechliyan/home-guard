export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: Record<string, any>;
    logging?: Record<string, any>;
  };
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface SmartDevice {
  id: string;
  name: string;
  group: string;
  online: boolean;
  on: boolean;
  brightness?: number;
  provider?: string;
  lastUpdated?: string;
}

export interface SetGroupStateResult {
  ok: boolean;
  message: string;
  done: number;
  total: number;
  not_done: string[];
  command_id: string;
  ms: number;
  duplicate?: boolean;
}

export interface NaiveResult {
  message: string;
  sent_target?: string;
  sent_state?: boolean;
}

export interface ScheduleActionResult {
  needs_confirmation?: boolean;
  confirmed?: boolean;
  plan_id: string;
  message: string;
  schedule_name?: string;
  target?: string;
  state?: boolean;
  when_iso?: string;
  recurrence?: string;
  user_said_recurring?: boolean;
  routine_created?: boolean;
}

export interface LedgerEntry {
  command_id: string;
  target: string;
  state: boolean;
  planned: number;
  verified_on: number;
  retried: string[];
  routine_created: boolean;
  ms: number;
  summary: string;
  duplicate?: boolean;
  timestamp: string;
}

export interface ToolExecutionLog {
  id: string;
  timestamp: string;
  toolName: string;
  column: 'naive' | 'homeguard' | 'system';
  requestParams: any;
  response: any;
  latencyMs: number;
  error?: string;
  mcpSessionId?: string;
}

export interface ParsedCommand {
  action: 'on' | 'off';
  target: string;
  isSchedule: boolean;
  when_iso?: string;
  timeText?: string;
  recurrence: 'once' | 'daily' | 'weekly' | 'weekdays';
  user_said_recurring: boolean;
  rawText: string;
}

export interface SettingsState {
  mcpUrl: string;
  bearerToken: string;
}
