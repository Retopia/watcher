# Options Dashboard

A self-hosted dashboard for monitoring a stock watchlist, options chains, calculated Greeks, and Yahoo Finance news.

## Run With Docker Compose

```bash
docker compose up --build
```

The frontend is available at `http://localhost` by default. To use a different host port:

```bash
HTTP_PORT=8080 docker compose up --build
```

Edit `watchlist.json` to change the default tickers, or use `POST /api/config`.

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to `http://localhost:8000`.

## Notes

- yfinance/Yahoo Finance data is delayed and unofficial.
- Option Greeks are calculated by the backend with a Black-Scholes approximation using Yahoo's implied volatility values.
- Scheduler pre-warming runs during regular US market hours on weekdays. It does not account for exchange holidays.
