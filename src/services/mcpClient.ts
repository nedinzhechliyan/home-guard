import { McpInitializeResult, McpTool } from '../types';

export interface McpCallResult<T = any> {
  result: T;
  latencyMs: number;
  rawRequest: any;
  rawResponse: any;
  sessionId?: string;
}

export class McpClient {
  private url: string;
  private token: string;
  private sessionId: string | null = null;
  private requestIdCounter = 1;

  constructor(url: string, token: string = '') {
    this.url = url.trim().replace(/\/+$/, '');
    this.token = token.trim();
  }

  public updateConfig(url: string, token: string = '') {
    this.url = url.trim().replace(/\/+$/, '');
    this.token = token.trim();
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public clearSession(): void {
    this.sessionId = null;
  }

  private nextId(): number {
    return this.requestIdCounter++;
  }

  /**
   * Executes a low-level JSON-RPC 2.0 POST request against the MCP server.
   * Supports both application/json responses and text/event-stream SSE streamable HTTP.
   */
  public async sendJsonRpc<T = any>(
    method: string,
    params?: any,
    isNotification = false
  ): Promise<McpCallResult<T>> {
    if (!this.url) {
      throw new Error('MCP server URL is not configured. Open Settings to configure.');
    }

    const id = isNotification ? undefined : this.nextId();
    const payload: Record<string, any> = {
      jsonrpc: '2.0',
      method,
    };
    if (id !== undefined) {
      payload.id = id;
    }
    if (params !== undefined) {
      payload.params = params;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    const startTime = performance.now();
    let response: Response;

    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      const duration = performance.now() - startTime;
      const errorMsg = err?.message || 'Network request failed';
      throw new Error(`Failed to reach MCP server at ${this.url}: ${errorMsg} (${Math.round(duration)}ms)`);
    }

    // Capture Mcp-Session-Id header if returned by the server
    const responseSessionId = response.headers.get('mcp-session-id') || response.headers.get('Mcp-Session-Id');
    if (responseSessionId) {
      this.sessionId = responseSessionId;
    }

    const duration = performance.now() - startTime;

    // Handle HTTP error codes
    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        errorBody = response.statusText;
      }

      if (response.status === 401) {
        throw new Error(`HTTP 401 Unauthorized: MCP server rejected credentials or token is missing.`);
      }
      if (response.status === 405) {
        throw new Error(`HTTP 405 Method Not Allowed: Target URL does not accept POST requests.`);
      }
      if (response.status === 404) {
        throw new Error(`HTTP 404 Not Found: Check the MCP endpoint URL (${this.url}).`);
      }

      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorBody}`);
    }

    // Notifications (e.g. notifications/initialized) may return 202 or 204 with no body
    if (isNotification && (response.status === 202 || response.status === 204 || response.headers.get('content-length') === '0')) {
      return {
        result: (null as unknown) as T,
        latencyMs: Math.round(duration * 10) / 10,
        rawRequest: payload,
        rawResponse: { status: response.status, statusText: response.statusText },
        sessionId: this.sessionId || undefined,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    let parsedData: any = null;

    if (contentType.includes('text/event-stream')) {
      // Streamable HTTP: parse SSE event stream lines
      const text = await response.text();
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr) {
            try {
              parsedData = JSON.parse(jsonStr);
            } catch (parseErr) {
              // continue reading subsequent data lines
            }
          }
        }
      }
      if (!parsedData) {
        throw new Error(`Malformed SSE stream from MCP server: no valid JSON data line found.`);
      }
    } else {
      // Standard JSON response
      const rawText = await response.text();
      if (!rawText.trim() && isNotification) {
        return {
          result: (null as unknown) as T,
          latencyMs: Math.round(duration * 10) / 10,
          rawRequest: payload,
          rawResponse: { status: response.status },
          sessionId: this.sessionId || undefined,
        };
      }
      try {
        parsedData = JSON.parse(rawText);
      } catch (err: any) {
        throw new Error(`Invalid JSON-RPC response from server: ${rawText.slice(0, 200)}`);
      }
    }

    if (parsedData.error) {
      const code = parsedData.error.code ?? 'RPC_ERROR';
      const msg = parsedData.error.message || JSON.stringify(parsedData.error);
      throw new Error(`MCP Error [${code}]: ${msg}`);
    }

    return {
      result: parsedData.result,
      latencyMs: Math.round(duration * 10) / 10,
      rawRequest: payload,
      rawResponse: parsedData,
      sessionId: this.sessionId || undefined,
    };
  }

  /**
   * MCP Handshake Step 1: initialize
   * Protocol spec 2025-11-25
   */
  public async initialize(): Promise<McpCallResult<McpInitializeResult>> {
    return this.sendJsonRpc<McpInitializeResult>('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: {
        name: 'home-guard-console',
        version: '1.0.0',
      },
    });
  }

  /**
   * MCP Handshake Step 2: notifications/initialized
   */
  public async notifyInitialized(): Promise<McpCallResult<void>> {
    return this.sendJsonRpc<void>('notifications/initialized', {}, true);
  }

  /**
   * MCP Handshake Step 3: tools/list
   */
  public async listTools(): Promise<McpCallResult<{ tools: McpTool[] }>> {
    return this.sendJsonRpc<{ tools: McpTool[] }>('tools/list', {});
  }

  /**
   * Ping tool
   */
  public async ping(): Promise<McpCallResult<any>> {
    return this.sendJsonRpc<any>('ping', {});
  }

  /**
   * MCP Call Tool: tools/call
   */
  public async callTool<T = any>(
    name: string,
    toolArguments: Record<string, any> = {}
  ): Promise<McpCallResult<T>> {
    const rpcRes = await this.sendJsonRpc<{ content?: Array<{ type: string; text?: string }>; isError?: boolean }>(
      'tools/call',
      {
        name,
        arguments: toolArguments,
      }
    );

    // MCP tools/call standard return structure is { content: [{ type: 'text', text: '...' }] } or direct object
    let resultPayload: any = rpcRes.result;
    if (rpcRes.result && Array.isArray(rpcRes.result.content)) {
      const textItem = rpcRes.result.content.find((c: any) => c.type === 'text');
      if (textItem && typeof textItem.text === 'string') {
        try {
          resultPayload = JSON.parse(textItem.text);
        } catch {
          resultPayload = textItem.text;
        }
      }
    }

    if (rpcRes.result?.isError) {
      const errDetail = typeof resultPayload === 'string' ? resultPayload : JSON.stringify(resultPayload);
      throw new Error(`Tool execution failed: ${errDetail}`);
    }

    return {
      result: resultPayload as T,
      latencyMs: rpcRes.latencyMs,
      rawRequest: rpcRes.rawRequest,
      rawResponse: rpcRes.rawResponse,
      sessionId: rpcRes.sessionId,
    };
  }
}
