import { Check, Pencil, Plus, RefreshCcw, X } from "lucide-react";
import { useState } from "react";

import { formatCompact, formatCurrency, formatSignedPercent } from "../formatters.js";

export default function Sidebar({
  items,
  selectedTicker,
  loading,
  error,
  onRefresh,
  onSelect,
  onSaveTickers
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const tickers = items.map((item) => item.ticker);

  async function commit(nextTickers) {
    setBusy(true);
    setFormError("");
    try {
      await onSaveTickers(nextTickers);
      return true;
    } catch (saveError) {
      setFormError(saveError.message || "Could not save the watchlist.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(event) {
    event.preventDefault();
    const symbol = draft.trim().toUpperCase();
    if (!symbol) return;
    if (tickers.includes(symbol)) {
      setFormError(`${symbol} is already on the watchlist.`);
      return;
    }
    const ok = await commit([...tickers, symbol]);
    if (ok) setDraft("");
  }

  async function handleRemove(symbol) {
    if (tickers.length <= 1) {
      setFormError("Keep at least one ticker on the watchlist.");
      return;
    }
    await commit(tickers.filter((item) => item !== symbol));
  }

  function toggleEditing() {
    setEditing((current) => !current);
    setFormError("");
    setDraft("");
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div>
          <span className="eyebrow">Watchlist</span>
          <h2>Options</h2>
        </div>
        <div className="sidebar-actions">
          <button
            className={editing ? "icon-button active" : "icon-button"}
            type="button"
            title={editing ? "Done editing" : "Edit watchlist"}
            aria-label={editing ? "Done editing" : "Edit watchlist"}
            aria-pressed={editing}
            onClick={toggleEditing}
          >
            {editing ? <Check size={17} aria-hidden="true" /> : <Pencil size={17} aria-hidden="true" />}
          </button>
          <button className="icon-button" type="button" title="Refresh watchlist" onClick={onRefresh}>
            <RefreshCcw className={loading ? "spin" : ""} size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && <div className="inline-error">{error}</div>}
      {formError && <div className="inline-error">{formError}</div>}

      {editing && (
        <form className="ticker-add" onSubmit={handleAdd}>
          <input
            className="ticker-input"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add ticker (e.g. TSLA)"
            aria-label="Add ticker"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
            maxLength={15}
            disabled={busy}
          />
          <button className="icon-button" type="submit" title="Add ticker" aria-label="Add ticker" disabled={busy}>
            <Plus size={18} aria-hidden="true" />
          </button>
        </form>
      )}

      <div className="watchlist" role="list">
        {items.map((item) => {
          const trendClass = item.changePercent >= 0 ? "positive" : "negative";
          const content = (
            <>
              <span className="ticker-block">
                <strong>{item.ticker}</strong>
                <small>{formatCompact(item.volume)}</small>
              </span>
              <span className="quote-block">
                <strong>{formatCurrency(item.price)}</strong>
                <small className={trendClass}>{formatSignedPercent(item.changePercent)}</small>
              </span>
            </>
          );

          if (editing) {
            return (
              <div className="watchlist-item editing" role="listitem" key={item.ticker}>
                {content}
                <button
                  className="remove-button"
                  type="button"
                  title={`Remove ${item.ticker}`}
                  aria-label={`Remove ${item.ticker}`}
                  onClick={() => handleRemove(item.ticker)}
                  disabled={busy}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            );
          }

          return (
            <button
              className={item.ticker === selectedTicker ? "watchlist-item selected" : "watchlist-item"}
              type="button"
              key={item.ticker}
              onClick={() => onSelect(item.ticker)}
            >
              {content}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
