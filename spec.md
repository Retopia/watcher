# Options Dashboard — Tech Spec

A self-hosted homelab webapp for monitoring a personal stock watchlist, options chains, Greeks, and news catalysts.

| | |
|---|---|
| **Data Source** | yfinance (Yahoo Finance, no API key) |
| **Deployment** | Self-hosted homelab via Docker Compose |
| **Refresh Rate** | 60 seconds during market hours |

---

## Goals

- Configurable watchlist of tickers
- Live-ish (60s refresh) stock price, day change, volume
- Options chain (calls + puts) for a selected expiry
- Key Greeks: delta, gamma, theta, vega, implied volatility
- Recent news headlines and catalysts per ticker
- Runs 24/7 on homelab, accessible from any browser on the local network

## Non-Goals

- Real-time tick-by-tick streaming
- Trade execution or brokerage integration
- Multi-user accounts or authentication
- Mobile-native app (responsive web is fine)
- Options P&L tracking
- Alerts/push notifications (v1)

---

## Architecture

Two-tier app: Python backend that fetches and caches market data, React frontend that polls and renders. Both run in Docker containers via Docker Compose.

```
options-dashboard/
  backend/
    main.py           # FastAPI app + routes
    cache.py          # TTL cache
    market.py         # yfinance wrappers
    scheduler.py      # APScheduler pre-warm jobs
    requirements.txt
  frontend/
    src/
      App.jsx
      components/Sidebar.jsx
      components/OptionsChain.jsx
      components/Greeks.jsx
      components/News.jsx
    nginx.conf
  watchlist.json      # user-edited ticker list
  docker-compose.yml
```

### Data Flow

1. Browser loads React SPA from nginx
2. Frontend calls `GET /api/watchlist` for the ticker list and quote data
3. User selects a ticker; frontend calls `/api/options/{ticker}` and `/api/news/{ticker}`
4. Backend checks cache → on miss, calls yfinance, caches, returns JSON
5. Frontend re-polls all active endpoints every 60 seconds

---

## Backend

**Stack:** Python 3.12, FastAPI, yfinance, APScheduler, uvicorn

### API Endpoints

| Endpoint | Returns | Cache TTL |
|---|---|---|
| `GET /api/watchlist` | All tickers with price, change %, volume | 60s |
| `GET /api/options/{ticker}?expiry=` | Calls + puts with strike, bid, ask, volume, OI, IV, Greeks | 60s |
| `GET /api/news/{ticker}` | Up to 10 headlines with title, publisher, timestamp, link | 10 min |
| `GET/POST /api/config` | Read or update the watchlist ticker list | — |

### Caching

Simple in-memory TTL dict keyed by `(endpoint, ticker, expiry)` — no Redis needed for a single-user setup.

APScheduler pre-warms the cache every 55 seconds during market hours (9:30am–4pm ET, Mon–Fri), so user requests almost always hit cache and respond in under 100ms.

---

## Frontend

**Stack:** React 18, Vite, plain CSS, Recharts (for IV chart), nginx

### Layout

- **Left sidebar** — watchlist with ticker, price, day change (green/red). Auto-refreshes every 60s.
- **Main panel** — three tabs for the selected ticker:
  - **Options Chain** — calls left, puts right, strikes in the middle. ATM strike highlighted. Columns: Strike, Bid, Ask, Last, Volume, OI, IV, Delta. Expiry date selector at top.
  - **Greeks** — ATM call/put Greeks side-by-side. IV term structure line chart across expiries.
  - **News** — scrollable headlines with title, publisher, "X hours ago", link out. Refreshes every 10 min.

Desktop-first (1024px+). Sidebar collapses to a top strip on narrow viewports.

---

## Deployment

Two Docker Compose services:

**`api`** — `python:3.12-slim`, runs uvicorn on port 8000, mounts `watchlist.json` for config persistence (~200MB RAM)

**`frontend`** — `nginx:alpine`, serves the React bundle, proxies `/api/*` to the api service (~20MB RAM)

Access the app at `http://<homelab-ip>` from any device on the local network. For remote access, Tailscale or WireGuard is recommended over exposing port 80 publicly.

---

## Data Notes & Limitations

- Prices are delayed anywhere from a few seconds to ~15 minutes depending on Yahoo's feed. Fine for a monitoring dashboard.
- Greeks from yfinance are calculated, not exchange-sourced. Good enough for most purposes but may differ slightly from broker values.
- yfinance is unofficial and could break if Yahoo changes their internal API. The library is actively maintained and has been stable for years.
- News returns Yahoo's curated headlines — typically 5–20 items, a few days' worth. Not a comprehensive feed.
- No historical options data is stored. Live view only.

---

## Future Ideas (v2+)

- Price/Greeks alerts via Pushover or ntfy.sh
- Unusual options activity detection (volume spikes vs OI)
- Watchlist editing UI instead of editing JSON manually
- Historical IV chart using stored snapshots
- Earnings calendar (yfinance provides this)