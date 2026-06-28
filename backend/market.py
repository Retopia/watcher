from __future__ import annotations

import json
import math
import os
import re
from datetime import datetime, time, timezone
from pathlib import Path
from statistics import mean
from typing import Any
from zoneinfo import ZoneInfo

import yfinance as yf
import pandas_market_calendars as mcal


MARKET_TZ = ZoneInfo("America/New_York")
NYSE_CALENDAR = mcal.get_calendar("NYSE")
DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA", "SPY", "QQQ"]
TICKER_RE = re.compile(r"^[A-Z0-9][A-Z0-9.-]{0,14}$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_market_hours(now: datetime | None = None) -> bool:
    current = now if now else datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=MARKET_TZ)

    current_et = current.astimezone(MARKET_TZ)
    current_utc = current.astimezone(timezone.utc)

    schedule = NYSE_CALENDAR.schedule(
        start_date=current_et.date(),
        end_date=current_et.date(),
    )
    if schedule.empty:
        return False

    session = schedule.iloc[0]
    market_open = session["market_open"].to_pydatetime().astimezone(timezone.utc)
    market_close = session["market_close"].to_pydatetime().astimezone(timezone.utc)
    return market_open <= current_utc <= market_close


def normalize_ticker(ticker: str) -> str:
    symbol = ticker.strip().upper()
    if not TICKER_RE.match(symbol):
        raise ValueError(f"Invalid ticker: {ticker}")
    return symbol


def normalize_tickers(tickers: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for ticker in tickers:
        symbol = normalize_ticker(ticker)
        if symbol not in seen:
            normalized.append(symbol)
            seen.add(symbol)
    if not normalized:
        raise ValueError("Watchlist must include at least one ticker")
    return normalized


def load_watchlist(path: Path) -> list[str]:
    if not path.exists():
        return DEFAULT_TICKERS.copy()

    data = json.loads(path.read_text())
    if isinstance(data, list):
        tickers = data
    elif isinstance(data, dict):
        tickers = data.get("tickers", [])
    else:
        raise ValueError("watchlist.json must be a list or an object with a tickers field")

    if not isinstance(tickers, list) or not all(isinstance(item, str) for item in tickers):
        raise ValueError("watchlist tickers must be strings")

    return normalize_tickers(tickers)


def save_watchlist(path: Path, tickers: list[str]) -> list[str]:
    normalized = normalize_tickers(tickers)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp")
    tmp_path.write_text(json.dumps({"tickers": normalized}, indent=2) + "\n")
    tmp_path.replace(path)
    return normalized


def get_watchlist_quotes(tickers: list[str]) -> dict[str, Any]:
    return {
        "updatedAt": now_iso(),
        "marketOpen": is_market_hours(),
        "items": [_get_quote(symbol) for symbol in tickers],
    }


def get_options_chain(ticker: str, expiry: str | None = None) -> dict[str, Any]:
    symbol = normalize_ticker(ticker)
    yf_ticker = yf.Ticker(symbol)
    expiries = list(yf_ticker.options or [])
    if not expiries:
        raise ValueError(f"No options expiries found for {symbol}")

    selected_expiry = expiry or expiries[0]
    if selected_expiry not in expiries:
        raise ValueError(f"Expiry {selected_expiry} is not available for {symbol}")

    quote = _get_quote(symbol, yf_ticker=yf_ticker)
    underlying_price = quote.get("price")
    if underlying_price is None:
        raise ValueError(f"Could not resolve an underlying price for {symbol}")

    chain = yf_ticker.option_chain(selected_expiry)
    years_to_expiry = _years_to_expiry(selected_expiry)
    risk_free_rate = _risk_free_rate()

    calls = _enrich_option_rows(
        chain.calls,
        option_type="call",
        underlying_price=underlying_price,
        years_to_expiry=years_to_expiry,
        risk_free_rate=risk_free_rate,
    )
    puts = _enrich_option_rows(
        chain.puts,
        option_type="put",
        underlying_price=underlying_price,
        years_to_expiry=years_to_expiry,
        risk_free_rate=risk_free_rate,
    )
    strikes = sorted({row["strike"] for row in calls + puts if row.get("strike") is not None})
    atm_strike = min(strikes, key=lambda strike: abs(strike - underlying_price)) if strikes else None

    return {
        "ticker": symbol,
        "updatedAt": now_iso(),
        "marketOpen": is_market_hours(),
        "underlyingPrice": underlying_price,
        "expiry": selected_expiry,
        "expiries": expiries,
        "riskFreeRate": risk_free_rate,
        "atmStrike": atm_strike,
        "atm": {
            "call": _nearest_contract(calls, atm_strike),
            "put": _nearest_contract(puts, atm_strike),
        },
        "calls": calls,
        "puts": puts,
        "ivTermStructure": _iv_term_structure(
            yf_ticker=yf_ticker,
            expiries=expiries,
            selected_expiry=selected_expiry,
            selected_chain=chain,
            underlying_price=underlying_price,
        ),
    }


def get_news(ticker: str, limit: int = 10) -> dict[str, Any]:
    symbol = normalize_ticker(ticker)
    items = yf.Ticker(symbol).news or []
    headlines = [_normalize_news_item(item) for item in items]
    headlines = [item for item in headlines if item.get("title") and item.get("link")]

    return {
        "ticker": symbol,
        "updatedAt": now_iso(),
        "items": headlines[:limit],
    }


def _get_quote(symbol: str, yf_ticker: Any | None = None) -> dict[str, Any]:
    ticker = yf_ticker or yf.Ticker(symbol)
    price = previous_close = change = change_percent = volume = currency = None

    try:
        info = ticker.get_info()
        price = _safe_float(_dict_value(info, "regularMarketPrice", "currentPrice"))
        previous_close = _safe_float(
            _dict_value(info, "regularMarketPreviousClose", "previousClose")
        )
        change = _safe_float(_dict_value(info, "regularMarketChange"))
        change_percent = _safe_float(_dict_value(info, "regularMarketChangePercent"))
        volume = _safe_int(_dict_value(info, "regularMarketVolume", "volume"))
        currency = _dict_value(info, "currency")
    except Exception:
        pass

    try:
        fast = ticker.fast_info
        price = price or _safe_float(_fast_value(fast, "lastPrice", "last_price"))
        previous_close = previous_close or _safe_float(
            _fast_value(
                fast,
                "regularMarketPreviousClose",
                "previousClose",
                "previous_close",
            )
        )
        volume = volume or _safe_int(_fast_value(fast, "lastVolume", "last_volume", "volume"))
        currency = currency or _fast_value(fast, "currency")
    except Exception:
        pass

    try:
        history = ticker.history(period="5d", interval="1d", auto_adjust=False)
        if not history.empty:
            latest = history.iloc[-1]
            price = price or _safe_float(latest.get("Close"))
            volume = volume or _safe_int(latest.get("Volume"))
            if previous_close is None and len(history) >= 2:
                previous_close = _safe_float(history.iloc[-2].get("Close"))
    except Exception:
        pass

    if change is None and price is not None and previous_close not in (None, 0):
        change = price - previous_close
    if change_percent is None and change is not None and previous_close not in (None, 0):
        change_percent = (change / previous_close) * 100

    return {
        "ticker": symbol,
        "price": _round(price, 4),
        "previousClose": _round(previous_close, 4),
        "change": _round(change, 4),
        "changePercent": _round(change_percent, 4),
        "volume": volume,
        "currency": currency,
    }


def _dict_value(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = data.get(key)
        if value is not None:
            return value
    return None


def _fast_value(fast: Any, *keys: str) -> Any:
    for key in keys:
        try:
            value = fast.get(key)
            if value is not None:
                return value
        except Exception:
            pass

        try:
            value = getattr(fast, key)
            if value is not None:
                return value
        except Exception:
            pass

    return None


def _enrich_option_rows(
    frame: Any,
    option_type: str,
    underlying_price: float,
    years_to_expiry: float,
    risk_free_rate: float,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for _, row in frame.iterrows():
        strike = _safe_float(row.get("strike"))
        implied_volatility = _safe_float(row.get("impliedVolatility"))
        greeks = _black_scholes_greeks(
            option_type=option_type,
            underlying_price=underlying_price,
            strike=strike,
            years_to_expiry=years_to_expiry,
            implied_volatility=implied_volatility,
            risk_free_rate=risk_free_rate,
        )

        rows.append(
            {
                "contractSymbol": _safe_str(row.get("contractSymbol")),
                "type": option_type,
                "strike": _round(strike, 4),
                "bid": _round(_safe_float(row.get("bid")), 4),
                "ask": _round(_safe_float(row.get("ask")), 4),
                "last": _round(_safe_float(row.get("lastPrice")), 4),
                "change": _round(_safe_float(row.get("change")), 4),
                "percentChange": _round(_safe_float(row.get("percentChange")), 4),
                "volume": _safe_int(row.get("volume")),
                "openInterest": _safe_int(row.get("openInterest")),
                "impliedVolatility": _round(implied_volatility, 6),
                "inTheMoney": bool(row.get("inTheMoney")),
                **greeks,
            }
        )

    return sorted(rows, key=lambda item: item["strike"] if item["strike"] is not None else math.inf)


def _black_scholes_greeks(
    option_type: str,
    underlying_price: float | None,
    strike: float | None,
    years_to_expiry: float,
    implied_volatility: float | None,
    risk_free_rate: float,
) -> dict[str, float | None]:
    if (
        underlying_price is None
        or strike is None
        or underlying_price <= 0
        or strike <= 0
        or years_to_expiry <= 0
        or implied_volatility is None
        or implied_volatility <= 0
    ):
        return {"delta": None, "gamma": None, "theta": None, "vega": None}

    sqrt_t = math.sqrt(years_to_expiry)
    sigma_sqrt_t = implied_volatility * sqrt_t
    if sigma_sqrt_t == 0:
        return {"delta": None, "gamma": None, "theta": None, "vega": None}

    d1 = (
        math.log(underlying_price / strike)
        + (risk_free_rate + 0.5 * implied_volatility**2) * years_to_expiry
    ) / sigma_sqrt_t
    d2 = d1 - sigma_sqrt_t
    pdf_d1 = _normal_pdf(d1)

    if option_type == "call":
        delta = _normal_cdf(d1)
        theta = (
            -underlying_price * pdf_d1 * implied_volatility / (2 * sqrt_t)
            - risk_free_rate * strike * math.exp(-risk_free_rate * years_to_expiry) * _normal_cdf(d2)
        ) / 365
    else:
        delta = _normal_cdf(d1) - 1
        theta = (
            -underlying_price * pdf_d1 * implied_volatility / (2 * sqrt_t)
            + risk_free_rate
            * strike
            * math.exp(-risk_free_rate * years_to_expiry)
            * _normal_cdf(-d2)
        ) / 365

    gamma = pdf_d1 / (underlying_price * sigma_sqrt_t)
    vega = underlying_price * pdf_d1 * sqrt_t / 100

    return {
        "delta": _round(delta, 4),
        "gamma": _round(gamma, 6),
        "theta": _round(theta, 4),
        "vega": _round(vega, 4),
    }


def _iv_term_structure(
    yf_ticker: Any,
    expiries: list[str],
    selected_expiry: str,
    selected_chain: Any,
    underlying_price: float,
) -> list[dict[str, Any]]:
    max_expiries = int(os.getenv("MAX_TERM_EXPIRIES", "12"))
    points: list[dict[str, Any]] = []

    for expiry in expiries[:max_expiries]:
        try:
            chain = selected_chain if expiry == selected_expiry else yf_ticker.option_chain(expiry)
            atm_iv = _atm_implied_volatility(chain.calls, chain.puts, underlying_price)
            if atm_iv is None:
                continue
            points.append(
                {
                    "expiry": expiry,
                    "daysToExpiry": max(0, round(_years_to_expiry(expiry) * 365)),
                    "atmIv": _round(atm_iv, 6),
                }
            )
        except Exception:
            continue

    return points


def _atm_implied_volatility(calls: Any, puts: Any, underlying_price: float) -> float | None:
    candidates: list[tuple[float, float]] = []
    for frame in (calls, puts):
        for _, row in frame.iterrows():
            strike = _safe_float(row.get("strike"))
            iv = _safe_float(row.get("impliedVolatility"))
            if strike is None or iv is None or iv <= 0:
                continue
            candidates.append((abs(strike - underlying_price), iv))

    if not candidates:
        return None

    nearest_distance = min(distance for distance, _ in candidates)
    nearest_ivs = [iv for distance, iv in candidates if distance == nearest_distance]
    return mean(nearest_ivs)


def _nearest_contract(rows: list[dict[str, Any]], atm_strike: float | None) -> dict[str, Any] | None:
    if atm_strike is None or not rows:
        return None
    return min(rows, key=lambda row: abs((row.get("strike") or 0) - atm_strike))


def _years_to_expiry(expiry: str) -> float:
    expiry_close = datetime.strptime(expiry, "%Y-%m-%d").replace(
        hour=16,
        minute=0,
        second=0,
        microsecond=0,
        tzinfo=MARKET_TZ,
    )
    seconds = (expiry_close - datetime.now(MARKET_TZ)).total_seconds()
    return max(seconds / (365 * 24 * 60 * 60), 1 / 365)


def _risk_free_rate() -> float:
    try:
        return float(os.getenv("RISK_FREE_RATE", "0.045"))
    except ValueError:
        return 0.045


def _normalize_news_item(item: dict[str, Any]) -> dict[str, Any]:
    content = item.get("content") if isinstance(item.get("content"), dict) else item
    provider = content.get("provider") if isinstance(content.get("provider"), dict) else {}
    canonical_url = content.get("canonicalUrl") if isinstance(content.get("canonicalUrl"), dict) else {}
    click_url = content.get("clickThroughUrl") if isinstance(content.get("clickThroughUrl"), dict) else {}

    timestamp = None
    provider_publish_time = item.get("providerPublishTime") or content.get("providerPublishTime")
    if provider_publish_time:
        timestamp = datetime.fromtimestamp(int(provider_publish_time), tz=timezone.utc).isoformat()
    elif content.get("pubDate"):
        timestamp = _parse_datetime(content.get("pubDate"))

    return {
        "title": content.get("title"),
        "publisher": item.get("publisher") or provider.get("displayName"),
        "timestamp": timestamp,
        "link": item.get("link") or canonical_url.get("url") or click_url.get("url"),
        "summary": content.get("summary"),
        "relatedTickers": item.get("relatedTickers") or content.get("finance", {}).get("stockTickers", []),
    }


def _parse_datetime(value: str) -> str | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def _normal_cdf(value: float) -> float:
    return 0.5 * (1 + math.erf(value / math.sqrt(2)))


def _normal_pdf(value: float) -> float:
    return math.exp(-0.5 * value * value) / math.sqrt(2 * math.pi)


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _safe_int(value: Any) -> int | None:
    number = _safe_float(value)
    if number is None:
        return None
    return int(number)


def _safe_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _round(value: float | None, digits: int) -> float | None:
    if value is None:
        return None
    return round(value, digits)
