import { Activity, Moon, Newspaper, RefreshCcw, Sigma, Sun, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson, postJson } from "./api.js";
import Greeks from "./components/Greeks.jsx";
import News from "./components/News.jsx";
import OptionsChain from "./components/OptionsChain.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { formatCurrency } from "./formatters.js";

const WATCHLIST_REFRESH_MS = 60_000;
const OPTIONS_REFRESH_MS = 60_000;
const NEWS_REFRESH_MS = 600_000;
const REFRESH_SECONDS = Math.round(OPTIONS_REFRESH_MS / 1000);

const tabs = [
  { id: "chain", label: "Options Chain", icon: Table2 },
  { id: "greeks", label: "Greeks", icon: Sigma },
  { id: "news", label: "News", icon: Newspaper }
];

function getInitialTheme() {
  const fallback = "light";
  if (typeof window === "undefined") return fallback;

  try {
    const savedTheme = window.localStorage.getItem("theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  } catch {
    return fallback;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : fallback;
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [watchlist, setWatchlist] = useState({ items: [], updatedAt: null, marketOpen: false });
  const [selectedTicker, setSelectedTicker] = useState("");
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [activeTab, setActiveTab] = useState("chain");
  const [optionsData, setOptionsData] = useState(null);
  const [newsData, setNewsData] = useState(null);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [watchlistError, setWatchlistError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [newsError, setNewsError] = useState("");
  const [secondsToRefresh, setSecondsToRefresh] = useState(REFRESH_SECONDS);

  const selectedQuote = useMemo(
    () => watchlist.items.find((item) => item.ticker === selectedTicker),
    [selectedTicker, watchlist.items]
  );
  const isDarkTheme = theme === "dark";

  const loadWatchlist = useCallback(async () => {
    setWatchlistLoading(true);
    setWatchlistError("");
    try {
      const data = await fetchJson("/api/watchlist");
      setWatchlist(data);
      setSelectedTicker((current) => current || data.items?.[0]?.ticker || "");
    } catch (error) {
      setWatchlistError(error.message);
    } finally {
      setWatchlistLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    if (!selectedTicker) return;
    setOptionsLoading(true);
    setOptionsError("");
    try {
      const query = selectedExpiry ? `?expiry=${encodeURIComponent(selectedExpiry)}` : "";
      const data = await fetchJson(`/api/options/${encodeURIComponent(selectedTicker)}${query}`);
      setOptionsData(data);
    } catch (error) {
      setOptionsError(error.message);
      setOptionsData(null);
    } finally {
      setOptionsLoading(false);
    }
  }, [selectedExpiry, selectedTicker]);

  const loadNews = useCallback(async () => {
    if (!selectedTicker) return;
    setNewsLoading(true);
    setNewsError("");
    try {
      setNewsData(await fetchJson(`/api/news/${encodeURIComponent(selectedTicker)}`));
    } catch (error) {
      setNewsError(error.message);
      setNewsData(null);
    } finally {
      setNewsLoading(false);
    }
  }, [selectedTicker]);

  const saveTickers = useCallback(
    async (tickers) => {
      // Backend replaces the whole list and returns the normalized result;
      // reload quotes so the sidebar reflects the change immediately.
      await postJson("/api/config", { tickers });
      await loadWatchlist();
    },
    [loadWatchlist]
  );

  const handleRefresh = useCallback(() => {
    setSecondsToRefresh(REFRESH_SECONDS);
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    loadWatchlist();
    const interval = window.setInterval(loadWatchlist, WATCHLIST_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadWatchlist]);

  useEffect(() => {
    loadOptions();
    const interval = window.setInterval(loadOptions, OPTIONS_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadOptions]);

  useEffect(() => {
    loadNews();
    const interval = window.setInterval(loadNews, NEWS_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadNews]);

  // Reset the visible countdown whenever fresh options data lands (poll, manual
  // refresh, or ticker switch) so it always counts down to the next auto-refresh.
  useEffect(() => {
    setSecondsToRefresh(REFRESH_SECONDS);
  }, [optionsData]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsToRefresh((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("theme", theme);
    } catch {
      // Theme persistence is optional; the visible toggle should still work.
    }
  }, [theme]);

  function handleTickerSelect(ticker) {
    setSelectedTicker(ticker);
    setSelectedExpiry("");
    setOptionsData(null);
    setNewsData(null);
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  const expiryValue = selectedExpiry || optionsData?.expiry || "";

  return (
    <div className="app-shell">
      <Sidebar
        items={watchlist.items}
        selectedTicker={selectedTicker}
        loading={watchlistLoading}
        error={watchlistError}
        onRefresh={loadWatchlist}
        onSelect={handleTickerSelect}
        onSaveTickers={saveTickers}
      />

      <main className="dashboard">
        <header className="dashboard-header">
          <div>
            <div className="eyebrow">
              <Activity size={15} aria-hidden="true" />
              {watchlist.marketOpen ? "Market open" : "Market closed"}
            </div>
            <h1>{selectedTicker || "Watchlist"}</h1>
          </div>
          <div className="quote-strip">
            <div>
              <span>Last</span>
              <strong>{formatCurrency(selectedQuote?.price)}</strong>
            </div>
            <div className={selectedQuote?.changePercent >= 0 ? "positive" : "negative"}>
              <span>Day</span>
              <strong>
                {selectedQuote?.changePercent == null
                  ? "--"
                  : `${selectedQuote.changePercent > 0 ? "+" : ""}${selectedQuote.changePercent.toFixed(2)}%`}
              </strong>
            </div>
            <div className="refresh-card" aria-live="polite">
              <span>Auto-refresh</span>
              <strong>{secondsToRefresh > 0 ? `${secondsToRefresh}s` : "now…"}</strong>
            </div>
            <button
              className="icon-button"
              type="button"
              title={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={isDarkTheme}
              onClick={toggleTheme}
            >
              {isDarkTheme ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            </button>
            <button
              className="icon-button"
              type="button"
              title="Refresh active ticker"
              aria-label="Refresh active ticker"
              onClick={handleRefresh}
            >
              <RefreshCcw className={optionsLoading ? "spin" : ""} size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <nav className="tabs" aria-label="Ticker views">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                className={activeTab === tab.id ? "tab active" : "tab"}
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={17} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <section className="panel">
          {activeTab === "chain" && (
            <OptionsChain
              data={optionsData}
              ticker={selectedTicker}
              expiry={expiryValue}
              loading={optionsLoading}
              error={optionsError}
              onExpiryChange={setSelectedExpiry}
            />
          )}
          {activeTab === "greeks" && (
            <Greeks data={optionsData} ticker={selectedTicker} loading={optionsLoading} error={optionsError} />
          )}
          {activeTab === "news" && (
            <News data={newsData} ticker={selectedTicker} loading={newsLoading} error={newsError} onRefresh={loadNews} />
          )}
        </section>
      </main>
    </div>
  );
}
