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
    },
    outputSchema: {
      type: 'object',
      required: ['aave', 'morpho', 'best', 'bestApy'],
      properties: {
        aave: {
          type: 'object',
          description: 'Aave V3 supply yield on Base Mainnet',
          required: ['apy', 'apyFormatted', 'poolAddress'],
          properties: {
            apy: { type: 'number', description: 'Annual percentage yield as decimal (e.g. 0.0405 for 4.05%)' },
            apyFormatted: { type: 'string', description: 'Human-readable APY percentage (e.g. "4.05%")' },
            poolAddress: { type: 'string', description: 'Aave V3 Pool contract address on Base' }
          }
        },
        morpho: {
          type: 'object',
          description: 'Morpho Vault supply yield on Base Mainnet',
          required: ['apy', 'apyFormatted', 'marketId'],
          properties: {
            apy: { type: 'number', description: 'Net annual percentage yield as decimal (e.g. 0.0407 for 4.07%)' },
            apyFormatted: { type: 'string', description: 'Human-readable APY percentage (e.g. "4.07%")' },
            marketId: { type: 'string', description: 'Morpho Vault address or market identifier' }
          }
        },
        best: {
          type: 'string',
          enum: ['aave', 'morpho'],
          description: 'Protocol with the highest yield'
        },
        bestApy: {
          type: 'number',
          description: 'Highest supply APY currently available'
        },
        lastUpdated: {
          type: 'string',
          description: 'ISO 8601 timestamp of last oracle update'
        },
        isCached: {
          type: 'boolean',
          description: 'Whether rates were served from in-memory cache'
        }
      }
    },
    annotations: {
      readOnly: true,
      readOnlyHint: true,
      idempotent: true,
      idempotentHint: true,
      destructive: false,
      destructiveHint: false,
      openWorld: true,
      openWorldHint: true,
      audience: ['user', 'assistant']
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
    },
    outputSchema: {
      type: 'object',
      required: ['amountToPay', 'collateralTotal', 'feeAmount', 'yieldDepositAmount', 'totalRequiredAmount', 'selectedProtocol', 'estimatedAPY', 'estimatedRecoveryDays'],
      properties: {
        amountToPay: {
          type: 'string',
          description: 'USDC amount delivered to recipient'
        },
        collateralTotal: {
          type: 'string',
          description: 'Base collateral plus safety buffer in USDC'
        },
        feeAmount: {
          type: 'string',
          description: '0.5% developer fee in USDC (min 0.1, max 50)'
        },
        yieldDepositAmount: {
          type: 'string',
          description: 'USDC deposited into yield protocol to generate returns'
        },
        totalRequiredAmount: {
          type: 'string',
          description: 'Total USDC needed upfront (payment + fee + yield deposit)'
        },
        collateralMultiplier: {
          type: 'number',
          description: 'Collateral multiplier used (e.g. 20)'
        },
        bufferPercentage: {
          type: 'number',
          description: 'Safety buffer percentage applied (e.g. 8)'
        },
        selectedProtocol: {
          type: 'string',
          enum: ['aave', 'morpho'],
          description: 'Yield protocol selected for capital recovery'
        },
        estimatedAPY: {
          type: 'number',
          description: 'Active APY rate for the chosen protocol'
        },
        estimatedRecoveryDays: {
          type: 'number',
          description: 'Estimated days until earned yield equals payment + fee'
        },
        rates: {
          type: 'object',
          description: 'Live APY comparison across protocols',
          properties: {
            aave: { type: 'number', description: 'Aave V3 APY' },
            morpho: { type: 'number', description: 'Morpho APY' }
          }
        }
      }
    },
    annotations: {
      readOnly: true,
      readOnlyHint: true,
      idempotent: true,
      idempotentHint: true,
      destructive: false,
      destructiveHint: false,
      openWorld: false,
      openWorldHint: false,
      audience: ['user', 'assistant']
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
    },
    outputSchema: {
      type: 'object',
      required: ['success', 'chainId', 'summary', 'transactions', 'batchCalls'],
      properties: {
        success: {
          type: 'boolean',
          description: 'True if transaction generation succeeded'
        },
        chainId: {
          type: 'number',
          description: 'Target EVM Chain ID (8453 for Base)'
        },
        summary: {
          type: 'object',
          description: 'Detailed financial summary of the zero-cost payment plan',
          properties: {
            amountToPay: { type: 'string', description: 'USDC paid to recipient' },
            collateralTotal: { type: 'string', description: 'Total locked collateral in USDC' },
            feeAmount: { type: 'string', description: 'Developer fee in USDC' },
            yieldDepositAmount: { type: 'string', description: 'Deposit into yield vault in USDC' },
            totalRequiredAmount: { type: 'string', description: 'Total capital required upfront in USDC' },
            collateralMultiplier: { type: 'number', description: 'Multiplier used' },
            bufferPercentage: { type: 'number', description: 'Buffer percentage used' },
            protocol: { type: 'string', description: 'Selected yield protocol' },
            poolAddress: { type: 'string', description: 'Aave V3 Pool or Morpho Vault contract address' },
            estimatedAPY: { type: 'number', description: 'Active APY rate' },
            estimatedRecoveryDays: { type: 'number', description: 'Days to 100% principal + fee recovery' },
            sender: { type: 'string', description: 'Payer address' },
            recipient: { type: 'string', description: 'Recipient address' },
            developer: { type: 'string', description: 'Developer fee recipient address' }
          }
        },
        transactions: {
          type: 'array',
          description: 'Ordered array of 4 sequential EVM transactions for standard wallets',
          items: {
            type: 'object',
            required: ['step', 'name', 'to', 'data', 'value', 'description'],
            properties: {
              step: { type: 'number', description: 'Execution order index (1-4)' },
              name: { type: 'string', description: 'Action name (e.g. DEVELOPER_FEE, RECIPIENT_PAYMENT, APPROVE_POOL, SUPPLY_COLLATERAL)' },
              to: { type: 'string', description: 'Target contract address (USDC or Pool)' },
              data: { type: 'string', description: 'Hex-encoded calldata (0x...)' },
              value: { type: 'string', description: 'Native ETH value (always 0x0)' },
              description: { type: 'string', description: 'Human-readable explanation of transaction step' }
            }
          }
        },
        batchCalls: {
          type: 'array',
          description: 'EIP-5792 atomic batch calls array for Smart Accounts and Agentic Wallets',
          items: {
            type: 'object',
            required: ['to', 'data', 'value'],
            properties: {
              to: { type: 'string', description: 'Target contract address' },
              data: { type: 'string', description: 'Hex-encoded calldata' },
              value: { type: 'string', description: 'Native ETH value (0x0)' }
            }
          }
        }
      }
    },
    annotations: {
      readOnly: false,
      readOnlyHint: false,
      idempotent: true,
      idempotentHint: true,
      destructive: false,
      destructiveHint: false,
      openWorld: false,
      openWorldHint: false,
      audience: ['user', 'assistant']
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
            version: '2.1.2',
            description: 'Model Context Protocol (MCP) server for SelfPaid - Autonomous Zero-Cost DeFi Payments on Base Mainnet',
            iconUrl: 'https://selfpaid.cryptofolio.it/icon.png',
            homepage: 'https://github.com/altoninelli/selfpaid-mcp'
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
