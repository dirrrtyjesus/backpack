#!/usr/bin/env node

/**
 * On-Demand Transaction Indexer
 *
 * Exports indexing functions that can be called on-demand via API
 * instead of continuous polling. This saves resources and only indexes
 * when users actively check their activity.
 */

const https = require("https");

// Configuration
const CONFIG = {
  X1_TESTNET_RPC: "https://rpc.testnet.x1.xyz",
  X1_MAINNET_RPC: "https://rpc.mainnet.x1.xyz",
  SOLANA_MAINNET_RPC:
    "https://capable-autumn-thunder.solana-mainnet.quiknode.pro/3d4ed46b454fa0ca3df983502fdf15fe87145d9e/",
  SOLANA_DEVNET_RPC: "https://api.devnet.solana.com",
  SOLANA_TESTNET_RPC: "https://api.testnet.solana.com",
  API_SERVER: "http://localhost:4000",
  MAX_SIGNATURES_PER_FETCH: 100, // Fetch more on-demand since it's not running continuously
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,
};

// Track last processed signature for each wallet
const lastProcessedSignatures = new Map();

/**
 * Make RPC call to blockchain
 */
function rpcCall(endpoint, method, params) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    });

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(endpoint, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || "RPC error"));
          } else {
            resolve(response.result);
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Fetch transaction signatures for an address
 */
async function getSignaturesForAddress(
  rpcUrl,
  address,
  limit = 100,
  lastProcessed = null
) {
  const params = [address, { limit }];
  const result = await rpcCall(rpcUrl, "getSignaturesForAddress", params);

  if (!result || !lastProcessed) {
    return result;
  }

  // Filter out signatures we've already processed
  const newSignatures = [];
  for (const sig of result) {
    if (sig.signature === lastProcessed) {
      break;
    }
    newSignatures.push(sig);
  }

  return newSignatures;
}

/**
 * Fetch transaction details
 */
async function getTransaction(rpcUrl, signature) {
  return await rpcCall(rpcUrl, "getTransaction", [
    signature,
    {
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
    },
  ]);
}

// Import parsing functions from original indexer
const {
  parseTransaction,
  extractTokenBalanceChange,
  formatTokenAmount,
} = require("./transaction-indexer");

/**
 * Store transactions via API
 */
async function storeTransactions(address, providerId, transactions) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      address,
      providerId,
      transactions,
    });

    const url = new URL(`${CONFIG.API_SERVER}/transactions/store`);

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = require("http").request(url, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Update last indexed timestamp for a wallet
 */
async function updateLastIndexed(address, network) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ address, network });
    const url = new URL(`${CONFIG.API_SERVER}/wallets/update-indexed`);

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = require("http").request(url, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve();
      });
    });

    req.on("error", (error) => {
      console.error(`Warning: Failed to update last_indexed:`, error.message);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Index transactions for a specific wallet ON-DEMAND
 * This is called when user taps "Activity" in the app
 *
 * @param {string} address - Wallet address
 * @param {string} network - Network (e.g., "X1-testnet", "SOLANA-mainnet")
 * @returns {object} Result with indexed count and status
 */
async function indexWalletOnDemand(address, network) {
  console.log(
    `\n🔍 On-demand indexing: ${address.substring(0, 8)}... (${network})`
  );

  // Determine RPC URL and provider ID based on network
  let rpcUrl;
  let providerId;
  let blockchain = "x1";

  if (network === "mainnet" || network === "X1-mainnet") {
    rpcUrl = CONFIG.X1_MAINNET_RPC;
    providerId = "X1-mainnet";
    blockchain = "x1";
  } else if (network === "testnet" || network === "X1-testnet") {
    rpcUrl = CONFIG.X1_TESTNET_RPC;
    providerId = "X1-testnet";
    blockchain = "x1";
  } else if (network === "SOLANA-mainnet") {
    rpcUrl = CONFIG.SOLANA_MAINNET_RPC;
    providerId = "SOLANA-mainnet";
    blockchain = "solana";
  } else if (network === "SOLANA-devnet") {
    rpcUrl = CONFIG.SOLANA_DEVNET_RPC;
    providerId = "SOLANA-devnet";
    blockchain = "solana";
  } else if (network === "SOLANA-testnet") {
    rpcUrl = CONFIG.SOLANA_TESTNET_RPC;
    providerId = "SOLANA-testnet";
    blockchain = "solana";
  } else {
    rpcUrl = CONFIG.X1_TESTNET_RPC;
    providerId = "X1-testnet";
    blockchain = "x1";
  }

  try {
    // Fetch signatures
    const lastSig = lastProcessedSignatures.get(address);
    const signatures = await getSignaturesForAddress(
      rpcUrl,
      address,
      CONFIG.MAX_SIGNATURES_PER_FETCH,
      lastSig
    );

    if (!signatures || signatures.length === 0) {
      console.log(`   ℹ️  No new transactions found`);
      return {
        success: true,
        indexed: 0,
        duplicates: 0,
        errors: 0,
        message: "No new transactions",
      };
    }

    console.log(`   📥 Found ${signatures.length} signatures`);

    // Fetch and parse transactions
    const transactions = [];
    let fetchErrors = 0;

    for (const sigInfo of signatures) {
      try {
        const txData = await getTransaction(rpcUrl, sigInfo.signature);
        const parsed = parseTransaction(
          txData,
          sigInfo.signature,
          address,
          blockchain
        );
        transactions.push(parsed);
      } catch (error) {
        console.error(
          `   ❌ Error fetching tx ${sigInfo.signature}:`,
          error.message
        );
        fetchErrors++;
      }
    }

    if (transactions.length === 0) {
      return {
        success: true,
        indexed: 0,
        duplicates: 0,
        errors: fetchErrors,
        message: "No transactions to store",
      };
    }

    // Store transactions
    console.log(`   💾 Storing ${transactions.length} transactions...`);
    const result = await storeTransactions(address, providerId, transactions);

    console.log(
      `   ✅ Stored: ${result.inserted} new, ${result.duplicates} duplicates, ${result.errors} errors`
    );

    // Update last processed signature
    if (signatures.length > 0) {
      lastProcessedSignatures.set(address, signatures[0].signature);
    }

    // Update last indexed timestamp
    await updateLastIndexed(address, network);

    return {
      success: true,
      indexed: result.inserted,
      duplicates: result.duplicates,
      errors: result.errors + fetchErrors,
      totalSignatures: signatures.length,
      message: `Successfully indexed ${result.inserted} new transactions`,
    };
  } catch (error) {
    console.error(`   ❌ Error indexing wallet:`, error.message);
    return {
      success: false,
      indexed: 0,
      duplicates: 0,
      errors: 1,
      message: error.message,
    };
  }
}

module.exports = {
  indexWalletOnDemand,
  CONFIG,
};
