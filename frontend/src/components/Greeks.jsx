import { Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { formatDecimal, formatIv } from "../formatters.js";

export default function Greeks({ data, ticker, loading, error }) {
  if (error) return <EmptyState title="Greeks unavailable" detail={error} />;
  if (!data) {
    if (ticker)
      return <EmptyState title={`Loading ${ticker}`} detail="Fetching option chain data…" loading />;
    return <EmptyState title="No ticker selected" detail="Select a ticker from the watchlist." />;
  }

  const chartData = data.ivTermStructure.map((point) => ({
    expiry: point.expiry.slice(5),
    iv: Number((point.atmIv * 100).toFixed(2)),
    days: point.daysToExpiry
  }));

  return (
    <div className="greeks-view">
      <div className="greek-grid">
        <GreekContract title="ATM Call" contract={data.atm?.call} />
        <GreekContract title="ATM Put" contract={data.atm?.put} />
      </div>

      <div className="chart-section">
        <div className="section-heading">
          <span className="eyebrow">ATM IV</span>
          <h3>Term Structure</h3>
        </div>
        <div className="chart-frame">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 20, right: 24, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="expiry"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted)" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fill: "var(--muted)" }}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text)"
                  }}
                  formatter={(value) => [`${value}%`, "ATM IV"]}
                  itemStyle={{ color: "var(--text)" }}
                  labelFormatter={(label, payload) =>
                    payload?.[0]?.payload ? `${label} · ${payload[0].payload.days} DTE` : label
                  }
                  labelStyle={{ color: "var(--muted)" }}
                />
                <Line type="monotone" dataKey="iv" stroke="var(--chart-line)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No IV curve" detail="No term structure data returned." />
          )}
        </div>
      </div>
    </div>
  );
}

function GreekContract({ title, contract }) {
  return (
    <div className="metric-card">
      <div className="section-heading">
        <span className="eyebrow">{contract?.contractSymbol || "--"}</span>
        <h3>{title}</h3>
      </div>
      <dl className="metric-list">
        <Metric label="Strike" value={formatDecimal(contract?.strike, 2)} />
        <Metric label="IV" value={formatIv(contract?.impliedVolatility)} />
        <Metric label="Delta" value={formatDecimal(contract?.delta, 4)} />
        <Metric label="Gamma" value={formatDecimal(contract?.gamma, 6)} />
        <Metric label="Theta" value={formatDecimal(contract?.theta, 4)} />
        <Metric label="Vega" value={formatDecimal(contract?.vega, 4)} />
      </dl>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
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
