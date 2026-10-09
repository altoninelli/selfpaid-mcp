# 🌾 SelfPaid MCP Server

[![MCP](https://img.shields.io/badge/MCP-Standard-green.svg)](https://modelcontextprotocol.io)
[![Base](https://img.shields.io/badge/Base-Mainnet-blue.svg)](https://base.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Model Context Protocol (MCP) server for SelfPaid** — Autonomous, zero-net-cost payments on **Base Mainnet (Chain ID 8453)** powered by automated yield farming on **Aave V3** and **Morpho**.

This server provides AI agents (Claude, Cursor, Windsurf, OpenClaw) with tools to analyze yield rates, calculate capital recovery timelines, and construct ready-to-sign EVM transactions and atomic **EIP-5792** batch calls.

---

## ⚡ Features

* **Zero External Dependencies**: Built with native Node.js HTTP/HTTPS modules. Works out-of-the-box on Node 16, 18, 20, and 22+.
* **Non-Custodial**: Generates unsigned EVM transaction calldata. Never handles or asks for private keys.
* **100% Capital Recovery**: Computes the exact collateral required to reimburse 100% of the payment and fees over time via DeFi yield.
* **Multi-Protocol Optimization**: Automatically selects the most profitable lending protocol between Aave V3 and Morpho on Base.

---

## 🛠️ Exposed MCP Tools

| Tool | Description | Key Parameters |
|---|---|---|
| `get_rates` | Live supply APYs for Aave V3 and Morpho on Base Mainnet. | `refresh` *(boolean, optional)* |
| `get_quote` | Calculates required collateral, developer fee, yield deposit, and recovery days. | `amount` *(number, required)*, `protocol` *(auto/aave/morpho)* |
| `build_payment` | Builds 4 EVM transactions & EIP-5792 batch calls ready for signing. | `amount`, `recipient`, `sender`, `protocol` |

---

## 🚀 Installation & Usage

### 1. Claude Desktop

Add this to your `claude_desktop_config.json`:

* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "selfpaid": {
      "command": "npx",
      "args": ["-y", "@altoninelli/selfpaid-mcp"]
    }
  }
}
```

*Or run from a local clone:*
```json
{
  "mcpServers": {
    "selfpaid": {
      "command": "node",
      "args": ["/path/to/selfpaid-mcp/bin/mcp-server.js"]
    }
  }
}
```

### 2. Cursor / Windsurf

Add a new MCP server in settings:
* **Name**: `selfpaid`
* **Type**: `command`
* **Command**: `node bin/mcp-server.js` (or `npx -y @altoninelli/selfpaid-mcp`)

### 3. Smithery.ai

Install via Smithery CLI:
```bash
npx -y @smithery/cli install @altoninelli/selfpaid-mcp --client claude
```

---

## 🌐 Hosted Infrastructure

This client connects to the official SelfPaid Base Mainnet engine:
* **API Endpoint**: `https://selfpaid.cryptofolio.it`
* **Network**: Base Mainnet (Chain ID `8453`)
* **Tokens Supported**: Native USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)

---

## ⚠️ Risk Disclosure

DeFi deposits carry smart contract, market, and liquidity risks. Transactions on Base Mainnet are irreversible. Principal recovery estimates are dynamic and fluctuate based on market lending yields.

## 📄 License

MIT License — Copyright (c) 2026 Alessandro Toninelli.
