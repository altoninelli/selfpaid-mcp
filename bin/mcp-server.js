#!/usr/bin/env node

/**
 * SelfPaid Model Context Protocol (MCP) Server
 * 
 * Exposes SelfPaid autonomous zero-cost payment tools to:
 * - Claude Desktop
 * - Cursor / Windsurf
 * - OpenClaw / ElizaOS / LangChain
 * - Any MCP-compliant AI agent framework
 * 
 * Complies with the Model Context Protocol (MCP) standard (JSON-RPC 2.0 over stdio).
 */

const readline = require('readline');

const API_BASE = process.env.SELFPAID_API_URL || 'https://selfpaid.cryptofolio.it';

// Define the 3 core MCP tools
const TOOLS = [
  {
    name: 'get_rates',
    description: 'Get real-time supply APYs across Aave V3 and Morpho on Base Mainnet. Automatically indicates the most profitable protocol for capital recovery.',
    inputSchema: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: 'Force a live on-chain refresh rather than using cached rates (defaults to false).'
        }
      }
    }
  },
  {
    name: 'get_quote',
    description: 'Calculate collateral requirements, developer fee, yield deposit, and estimated recovery days for a zero-net-cost USDC payment on Base.',
    inputSchema: {
      type: 'object',
      required: ['amount'],
      properties: {
        amount: {
          type: 'number',
          description: 'Amount of USDC to pay to the recipient (e.g. 10 or 25.5).'
        },
        protocol: {
          type: 'string',
          enum: ['auto', 'aave', 'morpho'],
          description: "Yield protocol to use. 'auto' (recommended) automatically picks the higher yielding protocol."
        },
        collateral: {
          type: 'number',
          description: 'Collateral multiplier (default 20 = 20x the payment amount).'
        },
        buffer: {
          type: 'number',
          description: 'Safety buffer percentage (default 8 = 8%).'
        }
      }
    }
  },
  {
    name: 'build_payment',
    description: 'Generate ready-to-sign EVM transactions and EIP-5792 atomic batch calls for a zero-net-cost payment on Base (Chain ID 8453). Automatically supplies collateral into Aave V3 or Morpho to recover 100% of the principal + developer fee.',
    inputSchema: {
      type: 'object',
      required: ['amount', 'recipient', 'sender'],
      properties: {
        amount: {
          type: 'number',
          description: 'Amount of USDC to pay to the recipient (e.g. 25).'
        },
        recipient: {
          type: 'string',
          description: 'Ethereum address of the recipient receiving the payment (0x...).'
        },
        sender: {
          type: 'string',
          description: 'Ethereum address of the payer executing the transactions (0x...).'
        },
        protocol: {
          type: 'string',
          enum: ['auto', 'aave', 'morpho'],
          description: "Yield protocol to use ('auto', 'aave', or 'morpho'). Defaults to 'auto'."
        },
        collateral: {
          type: 'number',
          description: 'Collateral multiplier (defaults to 20).'
        },
        buffer: {
          type: 'number',
          description: 'Safety buffer percentage (defaults to 8).'
        }
      }
    }
  }
];

const https = require('https');
const http = require('http');

/**
 * Universal HTTP client supporting Node 16+ (using native https module or fetch)
 */
function httpRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;
    const data = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;

    const req = client.request(url, {
      method: options.method || 'GET',
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(options.headers || {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) {
            return reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          }
          resolve(parsed);
        } catch {
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * Tool execution handlers
 */
async function handleGetRates(args = {}) {
  const url = `${API_BASE}/api/v1/payment/rates${args.refresh ? '?refresh=true' : ''}`;
  return await httpRequest(url);
}

async function handleGetQuote(args = {}) {
  const params = new URLSearchParams({ amount: String(args.amount) });
  if (args.protocol) params.set('protocol', args.protocol);
  if (args.collateral) params.set('collateral', String(args.collateral));
  if (args.buffer) params.set('buffer', String(args.buffer));

  const url = `${API_BASE}/api/v1/payment/quote?${params.toString()}`;
  return await httpRequest(url);
}

async function handleBuildPayment(args = {}) {
  const url = `${API_BASE}/api/v1/payment/build`;
  return await httpRequest(url, {
    method: 'POST',
    body: args
  });
}

/**
 * Handle incoming JSON-RPC 2.0 requests
 */
async function handleRequest(request) {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'selfpaid-mcp',
            version: '2.1.2'
          }
        }
      };

    case 'notifications/initialized':
      // Client notification, no response required
      return null;

    case 'ping':
      return {
        jsonrpc: '2.0',
        id,
        result: {}
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS
        }
      };

    case 'tools/call': {
      const toolName = params?.name;
      const args = params?.arguments || {};

      try {
        let resultData;
        if (toolName === 'get_rates') {
          resultData = await handleGetRates(args);
        } else if (toolName === 'get_quote') {
          resultData = await handleGetQuote(args);
        } else if (toolName === 'build_payment') {
          resultData = await handleBuildPayment(args);
        } else {
          throw new Error(`Unknown tool: "${toolName}"`);
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(resultData, null, 2)
              }
            ]
          }
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error executing ${toolName}: ${err.message}`
              }
            ]
          }
        };
      }
    }

    default:
      if (id !== undefined) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
      }
      return null;
  }
}

/**
 * Stdio Transport Loop
 */
function startStdioServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const request = JSON.parse(trimmed);
      const response = await handleRequest(request);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (parseError) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: `Parse error: ${parseError.message}`
          }
        }) + '\n'
      );
    }
  });

  process.stderr.write('🚀 SelfPaid MCP Server running on stdio (JSON-RPC 2.0)\n');
}

// Start if invoked directly
if (require.main === module) {
  startStdioServer();
}

module.exports = { handleRequest, TOOLS };
