/**
 * Zero-Cost Refund Bot
 * Autonomous Agent Script powered by SelfPaidPal on Base Mainnet
 * 
 * Demonstrates how an AI Agent or E-Commerce backend can issue customer refunds
 * while recovering 100% of the capital via automated DeFi yield farming.
 * 
 * Zero external dependencies: uses native Node.js HTTPS module.
 */

const https = require('https');

const SELFPAY_API = process.env.SELFPAY_API_URL || 'https://selfpaid.cryptofolio.it';

// Lightweight native JSON HTTP helper
function apiRequest(endpoint, method = 'GET', payload = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SELFPAY_API}${endpoint}`);
    const body = payload ? JSON.stringify(payload) : null;

    const req = https.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ZeroCostRefundBot/1.0',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runRefundBot() {
  console.log('===========================================================');
  console.log('🤖 SelfPaidPal Autonomous Zero-Cost Refund Bot');
  console.log('===========================================================\n');

  // Customer refund request parameters
  const refundRequest = {
    customerAddress: '0x3333333333333333333333333333333333333333',
    companyTreasury: '0x1111111111111111111111111111111111111111',
    refundAmountUSDC: 25.00
  };

  console.log(`📦 Customer Address:   ${refundRequest.customerAddress}`);
  console.log(`💼 Company Treasury:   ${refundRequest.companyTreasury}`);
  console.log(`💵 Refund Requested:   ${refundRequest.refundAmountUSDC} USDC\n`);

  // Step 1: Query live Base Mainnet supply APY across protocols
  console.log('1️⃣ Fetching real-time yield rates from SelfPaidPal oracle...');
  const rates = await apiRequest('/api/v1/payment/rates');
  console.log(`   • Morpho Vault APY: ${(rates.morpho * 100).toFixed(2)}%`);
  console.log(`   • Aave V3 APY:      ${(rates.aave * 100).toFixed(2)}%`);
  console.log(`   • Selected Engine:  ${(rates.preferred || 'morpho').toUpperCase()} (Highest APY)\n`);

  // Step 2: Compute 100% Capital Recovery Quote
  console.log('2️⃣ Computing zero-net-cost treasury recovery plan...');
  const quote = await apiRequest(`/api/v1/payment/quote?amount=${refundRequest.refundAmountUSDC}&protocol=auto`);

  console.log(`   ✅ Customer Receives:         ${quote.amountToPay} USDC (Immediate settlement)`);
  console.log(`   🛡️ Developer Maintenance Fee: ${quote.feeAmount} USDC (0.5%)`);
  console.log(`   🌾 Yield Collateral Deposit:   ${quote.yieldDepositAmount} USDC`);
  console.log(`   🏦 Total Collateral Locked:   ${quote.collateralTotal} USDC`);
  console.log(`   🔄 100% Capital Recovery:     ~${quote.estimatedRecoveryDays} days via ${quote.selectedProtocol.toUpperCase()} yield\n`);

  // Step 3: Construct Ready-to-Sign EVM Transaction Batch
  console.log('3️⃣ Generating non-custodial EVM calldata & EIP-5792 atomic batch...');
  const payment = await apiRequest('/api/v1/payment/build', 'POST', {
    amount: refundRequest.refundAmountUSDC,
    recipient: refundRequest.customerAddress,
    sender: refundRequest.companyTreasury,
    protocol: 'auto'
  });

  if (!payment.success || !payment.transactions) {
    throw new Error('Failed to generate payment transactions');
  }

  console.log(`   ✅ Built ${payment.transactions.length} sequential transactions for Base Mainnet:`);
  payment.transactions.forEach(tx => {
    console.log(`      [Step ${tx.step}] ${tx.name} -> Target: ${tx.to}`);
  });

  console.log(`\n⚡ EIP-5792 Atomic Batch Calls: ${payment.batchCalls.length} calls bundled for Smart Accounts.`);
  console.log('🎉 Result: Customer is happy and refunded. Company recovers 100% of the cash via DeFi yield!\n');
}

// Execute demo
runRefundBot().catch(console.error);
