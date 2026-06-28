from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from cache import TTLCache
from market import (
    get_news,
    get_options_chain,
    get_watchlist_quotes,
    is_market_hours,
    load_watchlist,
    normalize_ticker,
    normalize_tickers,
    save_watchlist,
)
from scheduler import NEWS_TTL_SECONDS, OPTIONS_TTL_SECONDS, WATCHLIST_TTL_SECONDS, create_scheduler


WATCHLIST_PATH = Path(
    os.getenv("WATCHLIST_PATH", Path(__file__).resolve().parent.parent / "watchlist.json")
)

cache = TTLCache()
scheduler = create_scheduler(cache, WATCHLIST_PATH)


class WatchlistConfig(BaseModel):
    tickers: Annotated[list[str], Field(min_length=1, max_length=50)]


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler.start()
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="Options Dashboard API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, bool | str]:
    return {"status": "ok", "marketOpen": is_market_hours()}


@app.get("/api/config")
async def read_config() -> dict[str, list[str]]:
    try:
        return {"tickers": await run_in_threadpool(load_watchlist, WATCHLIST_PATH)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/config")
async def update_config(config: WatchlistConfig) -> dict[str, list[str]]:
    try:
        tickers = normalize_tickers(config.tickers)
        saved = await run_in_threadpool(save_watchlist, WATCHLIST_PATH, tickers)
        cache.clear()
        return {"tickers": saved}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/watchlist")
async def read_watchlist() -> dict:
    def load_payload() -> dict:
        tickers = load_watchlist(WATCHLIST_PATH)
        return get_watchlist_quotes(tickers)

    try:
        return await run_in_threadpool(
            cache.get_or_set,
            ("watchlist",),
            WATCHLIST_TTL_SECONDS,
            load_payload,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/options/{ticker}")
async def read_options(
    ticker: str,
    expiry: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$")] = None,
) -> dict:
    try:
        symbol = normalize_ticker(ticker)
        cache_expiry = expiry or ""
        return await run_in_threadpool(
            cache.get_or_set,
            ("options", symbol, cache_expiry),
            OPTIONS_TTL_SECONDS,
            lambda: get_options_chain(symbol, expiry),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/news/{ticker}")
async def read_news(ticker: str) -> dict:
    try:
        symbol = normalize_ticker(ticker)
        return await run_in_threadpool(
            cache.get_or_set,
            ("news", symbol),
            NEWS_TTL_SECONDS,
            lambda: get_news(symbol),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
