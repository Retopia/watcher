from __future__ import annotations

import logging
import os
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler

from cache import TTLCache
from market import get_news, get_options_chain, get_watchlist_quotes, is_market_hours, load_watchlist


WATCHLIST_TTL_SECONDS = 60
OPTIONS_TTL_SECONDS = 60
NEWS_TTL_SECONDS = 600

logger = logging.getLogger(__name__)


def create_scheduler(cache: TTLCache, watchlist_path: Path) -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="America/New_York")
    scheduler.add_job(
        _prewarm_market_data,
        "interval",
        seconds=55,
        args=[cache, watchlist_path],
        id="prewarm-market-data",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        _prewarm_news,
        "interval",
        minutes=10,
        args=[cache, watchlist_path],
        id="prewarm-news",
        max_instances=1,
        coalesce=True,
    )
    return scheduler


def _prewarm_market_data(cache: TTLCache, watchlist_path: Path) -> None:
    if not is_market_hours():
        cache.prune()
        return

    try:
        tickers = load_watchlist(watchlist_path)
        cache.set(("watchlist",), get_watchlist_quotes(tickers), WATCHLIST_TTL_SECONDS)

        limit = int(os.getenv("PREWARM_OPTIONS_LIMIT", "5"))
        for ticker in tickers[:limit]:
            try:
                cache.set(("options", ticker, ""), get_options_chain(ticker), OPTIONS_TTL_SECONDS)
            except Exception:
                logger.exception("Failed to prewarm options for %s", ticker)
    except Exception:
        logger.exception("Failed to prewarm market data")


def _prewarm_news(cache: TTLCache, watchlist_path: Path) -> None:
    if not is_market_hours():
        cache.prune()
        return

    try:
        tickers = load_watchlist(watchlist_path)
        for ticker in tickers:
            try:
                cache.set(("news", ticker), get_news(ticker), NEWS_TTL_SECONDS)
            except Exception:
                logger.exception("Failed to prewarm news for %s", ticker)
    except Exception:
        logger.exception("Failed to prewarm news")
