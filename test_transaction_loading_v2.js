#!/usr/bin/env node

/**
 * Test script for on-demand transaction indexing (v2)
 * Correct behavior: Check database first, only index from blockchain when DB is empty
 */

const https = require("https");
const http = require("http");

const CONFIG = {
  API_SERVER: "http://162.250.126.66:4000",

  TEST_WALLETS: [
    {
      address: "7nDHcEd9Zi5emsPDdEevjtrLQ8GCfg3ECcQWF9PK1sXN",
      network: "SOLANA-mainnet",
      name: "Solana Mainnet Wallet",
    },
  ],

  MAX_MONTHS: 6,
  MAX_BATCHES: 40,
  BATCH_SIZE: 100,
};

function makeRequest(url, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const lib = isHttps ? https : http;

    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
      const postData = JSON.stringify(body);
      options.headers["Content-Length"] = Buffer.byteLength(postData);
    }

    const req = lib.request(urlObj, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          resolve({ status: res.statusCode, data: response });
        } catch (error) {
          reject(
            new Error(`Failed to parse response: ${data.substring(0, 200)}`)
          );
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function triggerIndexing(address, network, beforeSignature = null) {
  const url = `${CONFIG.API_SERVER}/wallets/index-now`;
  const body = {
    address,
    network,
    ...(beforeSignature && { beforeSignature }),
  };

  console.log(
    `   🔄 Triggering blockchain indexing${beforeSignature ? ` (before: ${beforeSignature.substring(0, 8)}...)` : " (initial)"}`
  );

  const { status, data } = await makeRequest(url, "POST", body);

  if (status !== 200) {
    throw new Error(`Indexing failed: ${status} - ${JSON.stringify(data)}`);
  }

  return data;
}

async function fetchTransactionsFromDB(
  address,
  providerId,
  beforeSignature = null
) {
  let url = `${CONFIG.API_SERVER}/transactions/${address}?providerId=${providerId}`;
  if (beforeSignature) {
    url += `&before=${beforeSignature}`;
  }

  const { status, data } = await makeRequest(url);

  if (status !== 200) {
    throw new Error(`Failed to fetch transactions: ${status}`);
  }

  return data.transactions || [];
}

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  if (isNaN(date.getTime())) {
    return `Invalid (${timestamp})`;
  }
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function monthsDifference(newerTimestamp, olderTimestamp) {
  const newer = new Date(newerTimestamp * 1000);
  const older = new Date(olderTimestamp * 1000);

  const yearDiff = newer.getFullYear() - older.getFullYear();
  const monthDiff = newer.getMonth() - older.getMonth();

  return yearDiff * 12 + monthDiff;
}

async function testWalletHistory(walletConfig) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 Testing: ${walletConfig.name}`);
  console.log(`📍 Address: ${walletConfig.address.substring(0, 16)}...`);
  console.log(`🌐 Network: ${walletConfig.network}`);
  console.log(`${"=".repeat(80)}`);

  const allTransactions = [];
  let oldestSignature = null;
  let batchCount = 0;

  const startTime = Date.now();
  let newestTimestamp = null;
  let oldestTimestamp = null;

  // Step 1: Initial load (user opens Activity tab)
  console.log(`\n📱 Step 1: User opens Activity tab (initial load)`);
  console.log(`${"─".repeat(80)}`);

  // Check database first
  console.log(`   📂 Checking database for existing transactions...`);
  let dbTxs = await fetchTransactionsFromDB(
    walletConfig.address,
    walletConfig.network
  );

  if (dbTxs.length === 0) {
    // Database empty - trigger initial blockchain indexing
    const indexResult = await triggerIndexing(
      walletConfig.address,
      walletConfig.network
    );

    console.log(
      `   ✅ Indexed: ${indexResult.indexed} new transactions from blockchain`
    );
    console.log(`   📊 Duplicates: ${indexResult.duplicates}`);
    console.log(`   ❌ Errors: ${indexResult.errors}`);

    // Fetch the newly indexed transactions
    dbTxs = await fetchTransactionsFromDB(
      walletConfig.address,
      walletConfig.network
    );
  } else {
    console.log(
      `   ✓ Found ${dbTxs.length} existing transactions in database (no blockchain fetch needed)`
    );
  }

  if (dbTxs.length > 0) {
    batchCount++;
    allTransactions.push(...dbTxs);

    newestTimestamp = dbTxs[0].timestamp;
    oldestTimestamp = dbTxs[dbTxs.length - 1].timestamp;
    oldestSignature = dbTxs[dbTxs.length - 1].hash;

    console.log(`   📦 Batch 1: ${dbTxs.length} transactions`);
    console.log(
      `   📅 Date range: ${formatDate(oldestTimestamp)} to ${formatDate(newestTimestamp)}`
    );
    console.log(
      `   🔑 Oldest signature: ${oldestSignature.substring(0, 16)}...`
    );
  } else {
    console.log(`   ℹ️  No transactions found`);
    return {
      success: true,
      batches: 0,
      totalTransactions: 0,
      timeSpan: 0,
      elapsedTime: ((Date.now() - startTime) / 1000).toFixed(2),
    };
  }

  // Step 2+: Load more (user taps "Load More")
  let hasMore = true;
  while (hasMore && oldestSignature) {
    // Check if we've reached the batch limit
    if (batchCount >= CONFIG.MAX_BATCHES) {
      console.log(`\n✅ Reached batch limit (${batchCount} batches loaded)`);
      break;
    }

    // Check if we've reached the 6-month limit
    if (newestTimestamp && oldestTimestamp) {
      const monthsLoaded = monthsDifference(newestTimestamp, oldestTimestamp);
      if (monthsLoaded >= CONFIG.MAX_MONTHS) {
        console.log(
          `\n✅ Reached ${CONFIG.MAX_MONTHS}-month limit (${monthsLoaded} months loaded)`
        );
        break;
      }
    }

    console.log(`\n📱 Step ${batchCount + 1}: User taps "Load More" button`);
    console.log(`${"─".repeat(80)}`);

    // CORRECT BEHAVIOR: Check database FIRST
    console.log(
      `   📂 Checking database for more transactions (before: ${oldestSignature.substring(0, 8)}...)...`
    );

    let moreTxs = await fetchTransactionsFromDB(
      walletConfig.address,
      walletConfig.network,
      oldestSignature
    );

    if (moreTxs.length === 0) {
      // Database has no more records - trigger blockchain indexing
      console.log(`   ⚠️  Database exhausted - fetching from blockchain...`);

      const indexResult = await triggerIndexing(
        walletConfig.address,
        walletConfig.network,
        oldestSignature
      );

      console.log(
        `   ✅ Indexed: ${indexResult.indexed} new transactions from blockchain`
      );
      console.log(`   📊 Duplicates: ${indexResult.duplicates}`);
      console.log(`   ❌ Errors: ${indexResult.errors}`);

      if (indexResult.indexed === 0 && indexResult.duplicates === 0) {
        console.log(
          `   ✓ No more transactions available (reached end of blockchain history)`
        );
        hasMore = false;
        break;
      }

      // Fetch the newly indexed transactions
      moreTxs = await fetchTransactionsFromDB(
        walletConfig.address,
        walletConfig.network,
        oldestSignature
      );

      if (moreTxs.length === 0) {
        console.log(`   ✓ No more transactions (end of history)`);
        hasMore = false;
        break;
      }
    } else {
      console.log(
        `   ✓ Found ${moreTxs.length} more transactions in database (no blockchain fetch needed)`
      );
    }

    batchCount++;
    allTransactions.push(...moreTxs);

    const batchOldest = moreTxs[moreTxs.length - 1].timestamp;
    const batchNewest = moreTxs[0].timestamp;
    oldestTimestamp = batchOldest;
    const prevOldestSignature = oldestSignature;
    oldestSignature = moreTxs[moreTxs.length - 1].hash;

    console.log(`   📦 Batch ${batchCount}: ${moreTxs.length} transactions`);
    console.log(
      `   📅 Date range: ${formatDate(batchOldest)} to ${formatDate(batchNewest)}`
    );
    console.log(
      `   🔑 Oldest signature: ${oldestSignature.substring(0, 16)}...`
    );

    // Safety check: prevent infinite loops
    if (oldestSignature === prevOldestSignature) {
      console.log(
        `   ⚠️  WARNING: Oldest signature unchanged - stopping to prevent infinite loop`
      );
      break;
    }

    // Small delay
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Summary
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const monthsSpan =
    newestTimestamp && oldestTimestamp
      ? monthsDifference(newestTimestamp, oldestTimestamp)
      : 0;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 SUMMARY`);
  console.log(`${"=".repeat(80)}`);
  console.log(`✅ Total batches loaded: ${batchCount}`);
  console.log(`📦 Total transactions: ${allTransactions.length}`);
  console.log(`⏱️  Time elapsed: ${elapsedTime}s`);

  if (newestTimestamp && oldestTimestamp) {
    console.log(
      `📅 Full date range: ${formatDate(oldestTimestamp)} to ${formatDate(newestTimestamp)}`
    );
    console.log(`📊 Time span: ${monthsSpan} months`);
  }

  // Sample transactions for debugging
  if (allTransactions.length > 0) {
    console.log(`\n🔍 Sample Transactions:`);
    console.log(
      `   First: ${allTransactions[0].hash} | ${formatDate(allTransactions[0].timestamp)} | ${allTransactions[0].type}`
    );
    if (allTransactions.length > 1) {
      const mid = Math.floor(allTransactions.length / 2);
      console.log(
        `   Middle: ${allTransactions[mid].hash} | ${formatDate(allTransactions[mid].timestamp)} | ${allTransactions[mid].type}`
      );
      console.log(
        `   Last: ${allTransactions[allTransactions.length - 1].hash} | ${formatDate(allTransactions[allTransactions.length - 1].timestamp)} | ${allTransactions[allTransactions.length - 1].type}`
      );
    }
  }

  return {
    success: true,
    batches: batchCount,
    totalTransactions: allTransactions.length,
    timeSpan: monthsSpan,
    elapsedTime,
  };
}

async function runTests() {
  console.log(`\n🚀 Transaction Loading Test Suite (v2 - Database First)`);
  console.log(
    `📅 Target: Load up to ${CONFIG.MAX_BATCHES} batches (or ${CONFIG.MAX_MONTHS} months of history)`
  );
  console.log(`🖥️  Server: ${CONFIG.API_SERVER}`);
  console.log(
    `✨ New behavior: Check SQLite first, only fetch from blockchain when DB is empty\n`
  );

  const results = [];

  for (const wallet of CONFIG.TEST_WALLETS) {
    try {
      const result = await testWalletHistory(wallet);
      results.push({
        wallet: wallet.name,
        ...result,
      });
    } catch (error) {
      console.error(`\n❌ Error testing ${wallet.name}:`, error.message);
      results.push({
        wallet: wallet.name,
        success: false,
        error: error.message,
      });
    }
  }

  // Final summary
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 FINAL TEST RESULTS`);
  console.log(`${"=".repeat(80)}`);

  results.forEach((result, idx) => {
    console.log(`\n${idx + 1}. ${result.wallet}`);
    if (result.success) {
      console.log(`   ✅ SUCCESS`);
      console.log(
        `   📦 ${result.totalTransactions} transactions in ${result.batches} batches`
      );
      console.log(`   📅 ${result.timeSpan} months of history`);
      console.log(`   ⏱️  ${result.elapsedTime}s`);
    } else {
      console.log(`   ❌ FAILED: ${result.error || "Unknown error"}`);
    }
  });

  const allPassed = results.every((r) => r.success);
  console.log(`\n${"=".repeat(80)}`);
  if (allPassed) {
    console.log(`✅ ALL TESTS PASSED`);
  } else {
    console.log(`❌ SOME TESTS FAILED`);
  }
  console.log(`${"=".repeat(80)}\n`);

  process.exit(allPassed ? 0 : 1);
}

runTests().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
