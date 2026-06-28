import { ExternalLink, Loader2, RefreshCcw } from "lucide-react";

import { timeAgo } from "../formatters.js";

export default function News({ data, ticker, loading, error, onRefresh }) {
  if (error) return <EmptyState title="News unavailable" detail={error} />;
  if (!data) {
    if (ticker)
      return <EmptyState title={`Loading ${ticker}`} detail="Fetching headlines…" loading />;
    return <EmptyState title="No ticker selected" detail="Select a ticker from the watchlist." />;
  }

  return (
    <div className="news-view">
      <div className="panel-toolbar">
        <div>
          <span className="eyebrow">Headlines</span>
          <strong>{data.ticker}</strong>
        </div>
        <button className="icon-button" type="button" title="Refresh news" onClick={onRefresh}>
          <RefreshCcw className={loading ? "spin" : ""} size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="news-list">
        {data.items.length ? (
          data.items.map((item) => (
            <a className="news-item" href={item.link} target="_blank" rel="noreferrer" key={item.link}>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.publisher || "Yahoo Finance"}
                  {item.timestamp ? ` · ${timeAgo(item.timestamp)}` : ""}
                </small>
              </span>
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          ))
        ) : (
          <EmptyState title="No headlines" detail="No recent Yahoo Finance headlines returned." />
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, detail, loading }) {
  return (
    <div className={loading ? "empty-state loading-state" : "empty-state"}>
      <h3>
        {loading && <Loader2 className="spin" size={18} aria-hidden="true" />}
        {title}
      </h3>
      <p>{detail}</p>
    </div>
  );
}
