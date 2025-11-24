# Scripts Directory

This directory contains utility scripts for maintaining and populating the Backpack database.

## Token Sync Script

### `sync-jupiter-tokens.js`

This script fetches Solana token metadata from Jupiter's API and stores it in the local SQLite database.

#### Features

- **Rate Limited:** 1 API call per second to respect Jupiter's free tier limits
- Fetches verified and community tokens from Jupiter API V2
- Stores comprehensive token metadata including:
  - Basic info: name, symbol, decimals, icon
  - Market data: price, market cap, FDV, liquidity
  - Social links: Twitter, Discord, website, Telegram
  - Security info: verification status, organic score
  - Supply metrics: circulating supply, total supply, holder count
- Handles duplicate tokens gracefully (upsert logic)
- Provides progress indicators during sync
- Supports custom tag filtering

#### Usage

**Basic usage (syncs verified tokens):**

```bash
npm run sync-tokens
```

**Sync specific tags:**

```bash
node scripts/sync-jupiter-tokens.js --tags=verified,community
```

**Available tags:**

- `verified` - Verified tokens with good organic scores
- `community` - Community tokens
- `lst` - Liquid staking tokens
- Other custom tags from Jupiter's API

#### Database Schema

The script populates the `tokens` table with the following structure:

```sql
CREATE TABLE tokens (
  id TEXT PRIMARY KEY,              -- Token mint address
  name TEXT NOT NULL,               -- Token name
  symbol TEXT NOT NULL,             -- Token symbol
  icon TEXT,                        -- Logo URL
  decimals INTEGER NOT NULL,        -- Decimal places
  dev TEXT,                         -- Developer address
  circ_supply REAL,                 -- Circulating supply
  total_supply REAL,                -- Total supply
  token_program TEXT,               -- Token program address
  holder_count INTEGER,             -- Number of holders
  fdv REAL,                         -- Fully diluted valuation
  mcap REAL,                        -- Market cap
  usd_price REAL,                   -- Current USD price
  price_block_id INTEGER,           -- Price reference block
  liquidity REAL,                   -- Total liquidity
  twitter TEXT,                     -- Twitter URL
  discord TEXT,                     -- Discord invite
  website TEXT,                     -- Official website
  telegram TEXT,                    -- Telegram link
  tags TEXT,                        -- Comma-separated tags
  is_verified INTEGER DEFAULT 0,   -- Verification status (0/1)
  organic_score REAL,               -- Quality score (0-100)
  created_at TEXT,                  -- Token creation timestamp
  updated_at TEXT,                  -- Jupiter metadata update time
  last_synced DATETIME              -- Last sync timestamp
);
```

#### API Reference

This script uses [Jupiter's Token API V2 (Beta)](https://dev.jup.ag/docs/token-api/v2):

- **Endpoint:** `https://lite-api.jup.ag/tokens/v2/tag?query={tag}`
- **Rate Limits:** Free tier with rate limits
- **Documentation:** See [Jupiter Developer Docs](https://dev.jup.ag/docs/token-api/)

#### Example Output

```
🚀 Starting Jupiter token sync for tags: verified
✅ Connected to database
📡 Fetching tokens for tag: verified
   URL: https://lite-api.jup.ag/tokens/v2/tag?query=verified
✅ Fetched 450 tokens for tag: verified

💾 Inserting 450 tokens into database...
   Progress: 100/450 tokens processed
   Progress: 200/450 tokens processed
   Progress: 300/450 tokens processed
   Progress: 400/450 tokens processed
✅ Completed tag: verified

📊 Sync Summary:
   Total tokens processed: 450
   Total errors: 0

✅ Token sync completed successfully!
✅ Database connection closed
```

#### Notes

- The script uses `INSERT OR REPLACE` to handle token updates gracefully
- Existing tokens are updated with latest metadata on each run
- The `last_synced` timestamp tracks when each token was last updated
- Failed token inserts are logged but don't stop the entire sync process

#### Sources

- [Jupiter Token API Documentation](https://dev.jup.ag/docs/token-api/)
- [Jupiter Token List API](https://station.jup.ag/docs/token-list/token-list-api)
- [Jupiter GitHub Repository](https://github.com/jup-ag/token-list)
