#!/usr/bin/env node

/**
 * Jupiter Token Metadata Scraper
 *
 * This script fetches token metadata from Jupiter's API and stores it in the local SQLite database.
 * It fetches verified tokens and can be extended to fetch other token categories.
 *
 * Usage: node scripts/sync-jupiter-tokens.js [--tags=verified,community]
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Configuration
const DB_PATH = path.join(__dirname, "..", "transactions.db");
const JUPITER_API_BASE = "https://lite-api.jup.ag/tokens/v2";
const DEFAULT_TAGS = ["verified"];
const RATE_LIMIT_MS = 1000; // 1 call per second

// Parse command line arguments
const args = process.argv.slice(2);
const tagsArg = args.find((arg) => arg.startsWith("--tags="));
const tags = tagsArg ? tagsArg.split("=")[1].split(",") : DEFAULT_TAGS;

console.log(`🚀 Starting Jupiter token sync for tags: ${tags.join(", ")}`);

/**
 * Sleep utility for rate limiting
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Open database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("❌ Error opening database:", err);
    process.exit(1);
  }
  console.log("✅ Connected to database");
});

/**
 * Fetch tokens from Jupiter API by tag
 */
async function fetchTokensByTag(tag) {
  const url = `${JUPITER_API_BASE}/tag?query=${tag}`;
  console.log(`📡 Fetching tokens for tag: ${tag}`);
  console.log(`   URL: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const tokens = await response.json();
    console.log(`✅ Fetched ${tokens.length} tokens for tag: ${tag}`);
    return tokens;
  } catch (error) {
    console.error(`❌ Error fetching tokens for tag ${tag}:`, error.message);
    return [];
  }
}

/**
 * Insert or update a token in the database
 */
function upsertToken(token) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO tokens (
        id, name, symbol, icon, decimals, dev, circ_supply, total_supply,
        token_program, holder_count, fdv, mcap, usd_price, price_block_id,
        liquidity, twitter, discord, website, telegram, tags, is_verified,
        organic_score, created_at, updated_at, last_synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        symbol = excluded.symbol,
        icon = excluded.icon,
        decimals = excluded.decimals,
        dev = excluded.dev,
        circ_supply = excluded.circ_supply,
        total_supply = excluded.total_supply,
        token_program = excluded.token_program,
        holder_count = excluded.holder_count,
        fdv = excluded.fdv,
        mcap = excluded.mcap,
        usd_price = excluded.usd_price,
        price_block_id = excluded.price_block_id,
        liquidity = excluded.liquidity,
        twitter = excluded.twitter,
        discord = excluded.discord,
        website = excluded.website,
        telegram = excluded.telegram,
        tags = excluded.tags,
        is_verified = excluded.is_verified,
        organic_score = excluded.organic_score,
        updated_at = excluded.updated_at,
        last_synced = CURRENT_TIMESTAMP
    `;

    const params = [
      token.id,
      token.name || "",
      token.symbol || "",
      token.icon || null,
      token.decimals || 0,
      token.dev || null,
      token.circSupply || null,
      token.totalSupply || null,
      token.tokenProgram || null,
      token.holderCount || null,
      token.fdv || null,
      token.mcap || null,
      token.usdPrice || null,
      token.priceBlockId || null,
      token.liquidity || null,
      token.twitter || null,
      token.discord || null,
      token.website || null,
      token.telegram || null,
      Array.isArray(token.tags) ? token.tags.join(",") : null,
      token.isVerified ? 1 : 0,
      token.organicScore || null,
      token.createdAt || null,
      token.updatedAt || null,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
    });
  });
}

/**
 * Sync tokens for all specified tags
 */
async function syncTokens() {
  let totalProcessed = 0;
  let totalErrors = 0;

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];

    try {
      const tokens = await fetchTokensByTag(tag);

      // Rate limiting: wait 1 second before next API call
      if (i < tags.length - 1) {
        console.log(
          `⏱️  Rate limiting: waiting ${RATE_LIMIT_MS}ms before next tag...`
        );
        await sleep(RATE_LIMIT_MS);
      }

      console.log(`\n💾 Inserting ${tokens.length} tokens into database...`);

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        try {
          await upsertToken(token);
          totalProcessed++;

          // Progress indicator
          if ((i + 1) % 100 === 0) {
            console.log(
              `   Progress: ${i + 1}/${tokens.length} tokens processed`
            );
          }
        } catch (error) {
          console.error(`❌ Error inserting token ${token.id}:`, error.message);
          totalErrors++;
        }
      }

      console.log(`✅ Completed tag: ${tag}`);
    } catch (error) {
      console.error(`❌ Error processing tag ${tag}:`, error.message);
      totalErrors++;
    }
  }

  console.log(`\n📊 Sync Summary:`);
  console.log(`   Total tokens processed: ${totalProcessed}`);
  console.log(`   Total errors: ${totalErrors}`);
}

/**
 * Main execution
 */
async function main() {
  try {
    await syncTokens();
    console.log("\n✅ Token sync completed successfully!");
  } catch (error) {
    console.error("\n❌ Fatal error during sync:", error);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        console.error("❌ Error closing database:", err);
      } else {
        console.log("✅ Database connection closed");
      }
    });
  }
}

// Run the script
main();
