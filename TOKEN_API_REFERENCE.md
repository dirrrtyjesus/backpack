# Token API Reference

The X1 JSON Server now provides REST API endpoints to query Solana token metadata from the local SQLite database.

## 📊 Token Data Source

- **Data**: 4,151+ verified Solana tokens from Jupiter API
- **Updated**: Via `npm run sync-tokens` command
- **Database**: SQLite (`transactions.db`)
- **Fields**: Name, symbol, price, market cap, liquidity, social links, and more

---

## 🔌 API Endpoints

### 1. Query Token by Symbol or Mint

**GET** `/tokens?symbol=<SYMBOL>` or `/tokens?mint=<ADDRESS>`

Query token metadata by symbol (e.g., `SOL`) or mint address.

**Parameters:**

- `symbol` - Token symbol (case-insensitive)
- `mint` - Token mint address (exact match)
- `verified` - Filter for verified tokens only (`true`/`false`)
- `limit` - Max results for symbol search (default: 50, max: 100)

**Example:**

```bash
curl "http://localhost:4000/tokens?symbol=SOL"
curl "http://localhost:4000/tokens?mint=So11111111111111111111111111111111111111112"
curl "http://localhost:4000/tokens?symbol=USDC&verified=true"
```

**Response:**

```json
{
  "tokens": [
    {
      "mint": "So11111111111111111111111111111111111111112",
      "name": "Wrapped SOL",
      "symbol": "SOL",
      "icon": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      "decimals": 9,
      "price": 131.837,
      "mcap": 73715534348.98,
      "fdv": 81034719969.7,
      "liquidity": 156340658.91,
      "holderCount": 3820662,
      "isVerified": true,
      "organicScore": 98.77,
      "tags": ["verified", "major"],
      "social": {
        "twitter": null,
        "discord": null,
        "website": null,
        "telegram": null
      },
      "supply": {
        "circulating": 559138914.92,
        "total": 614655591.87
      },
      "lastSynced": "2025-11-24 05:06:43"
    }
  ],
  "count": 1,
  "query": { "symbol": "SOL", "verified": false }
}
```

---

### 2. Search Tokens

**GET** `/tokens/search?q=<QUERY>`

Search tokens by name or symbol (fuzzy match).

**Parameters:**

- `q` - Search query (min 2 characters)
- `verified` - Filter for verified tokens only (`true`/`false`)
- `limit` - Max results (default: 20, max: 100)

**Example:**

```bash
curl "http://localhost:4000/tokens/search?q=jup&limit=5"
curl "http://localhost:4000/tokens/search?q=solana&verified=true"
```

**Response:**

```json
{
  "tokens": [
    {
      "mint": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      "name": "Jupiter",
      "symbol": "JUP",
      "icon": "https://static.jup.ag/jup/icon.png",
      "decimals": 6,
      "price": 0.237,
      "mcap": 763964821.49,
      "isVerified": true,
      "organicScore": 97.88
    }
  ],
  "count": 1,
  "query": "jup"
}
```

---

### 3. Top Tokens by Market Cap

**GET** `/tokens/top?limit=<NUMBER>`

Get top tokens ranked by market capitalization.

**Parameters:**

- `limit` - Number of tokens to return (default: 10, max: 100)
- `verified` - Filter for verified tokens only (default: `true`)

**Example:**

```bash
curl "http://localhost:4000/tokens/top?limit=10"
curl "http://localhost:4000/tokens/top?limit=5&verified=false"
```

**Response:**

```json
{
  "tokens": [
    {
      "mint": "So11111111111111111111111111111111111111112",
      "name": "Wrapped SOL",
      "symbol": "SOL",
      "icon": "https://...",
      "decimals": 9,
      "price": 131.837,
      "mcap": 73715534348.98,
      "fdv": 81034719969.7,
      "liquidity": 156340658.91,
      "holderCount": 3820662,
      "isVerified": true,
      "organicScore": 98.77,
      "priceChange24h": null
    }
    // ... more tokens
  ],
  "count": 10
}
```

---

## 📱 Usage in Activity Tab

The Activity tab can now query token names and metadata for displaying transaction details:

### Before (Missing Token Info):

```
Transfer • 5 minutes ago
Token: EPjFW...t1v
Amount: 100.00
```

### After (With Token Info):

```javascript
// Fetch token metadata when displaying transaction
const response = await fetch(
  `http://localhost:4000/tokens?mint=${transaction.tokenMint}`
);
const { tokens } = await response.json();
const token = tokens[0];

// Display rich transaction info
console.log(`${token.symbol} • ${token.name}`);
console.log(`Amount: ${transaction.amount} ${token.symbol}`);
console.log(`Value: $${transaction.amount * token.price}`);
```

### Display Result:

```
USDC Transfer • 5 minutes ago
USD Coin
Amount: 100.00 USDC
Value: $99.97
```

---

## 🔄 Updating Token Data

To refresh token metadata from Jupiter API:

```bash
cd /home/jack/backpack-new-work
npm run sync-tokens
```

This will:

- Fetch latest token data from Jupiter API
- Update prices, market caps, and metadata
- Add any newly verified tokens
- Takes ~4-5 minutes for 4,151 tokens

---

## 📊 Available Token Fields

| Field          | Type     | Description                         |
| -------------- | -------- | ----------------------------------- |
| `mint`         | string   | Token mint address (unique ID)      |
| `name`         | string   | Full token name                     |
| `symbol`       | string   | Token ticker symbol                 |
| `icon`         | string   | Logo URL                            |
| `decimals`     | number   | Token decimals                      |
| `price`        | number   | Current USD price                   |
| `mcap`         | number   | Market capitalization               |
| `fdv`          | number   | Fully diluted valuation             |
| `liquidity`    | number   | Total liquidity                     |
| `holderCount`  | number   | Number of token holders             |
| `isVerified`   | boolean  | Verification status                 |
| `organicScore` | number   | Jupiter quality score (0-100)       |
| `tags`         | string[] | Token categories                    |
| `social`       | object   | Twitter, Discord, website, Telegram |
| `supply`       | object   | Circulating and total supply        |
| `lastSynced`   | datetime | Last database sync                  |

---

## 🎯 Integration Example

```javascript
// App.js - Activity tab transaction rendering

async function enrichTransactionWithTokenData(transaction) {
  if (!transaction.tokenMint) {
    return transaction; // Native token (SOL/XNT)
  }

  try {
    const response = await fetch(
      `http://localhost:4000/tokens?mint=${transaction.tokenMint}`
    );
    const { tokens } = await response.json();

    if (tokens.length > 0) {
      const token = tokens[0];
      return {
        ...transaction,
        tokenName: token.name,
        tokenSymbol: token.symbol,
        tokenIcon: token.icon,
        tokenPrice: token.price,
        valueUSD: parseFloat(transaction.amount) * token.price,
      };
    }
  } catch (error) {
    console.error("Failed to fetch token metadata:", error);
  }

  return transaction;
}

// Usage in Activity tab
const enrichedTransactions = await Promise.all(
  transactions.map((tx) => enrichTransactionWithTokenData(tx))
);
```

---

## 🚀 Quick Test

```bash
# Query SOL token
curl "http://localhost:4000/tokens?symbol=SOL" | jq '.tokens[0] | {name, symbol, price, mcap}'

# Search for USDC
curl "http://localhost:4000/tokens/search?q=usdc" | jq '.tokens[] | {name, symbol, price}'

# Top 5 tokens
curl "http://localhost:4000/tokens/top?limit=5" | jq '.tokens[] | {symbol, name, mcap}'
```

---

## 📝 Notes

- All prices are in USD
- Market caps and FDVs are in USD
- Token data is cached locally for fast queries
- Run `npm run sync-tokens` periodically to keep data fresh
- Verified tokens are recommended for production use
- Use `verified=true` parameter to filter for quality tokens
