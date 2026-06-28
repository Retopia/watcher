import { Loader2 } from "lucide-react";
import { useMemo } from "react";

import { formatDecimal, formatIv, formatNumber } from "../formatters.js";

export default function OptionsChain({ data, ticker, expiry, loading, error, onExpiryChange }) {
  const rows = useMemo(() => {
    if (!data) return [];

    const calls = new Map(data.calls.map((contract) => [contract.strike, contract]));
    const puts = new Map(data.puts.map((contract) => [contract.strike, contract]));
    return Array.from(new Set([...calls.keys(), ...puts.keys()]))
      .sort((a, b) => a - b)
      .map((strike) => ({
        strike,
        call: calls.get(strike),
        put: puts.get(strike)
      }));
  }, [data]);

  if (error) return <EmptyState title="Options unavailable" detail={error} />;
  if (!data) {
    if (ticker)
      return <EmptyState title={`Loading ${ticker}`} detail="Fetching the option chain…" loading />;
    return <EmptyState title="No ticker selected" detail="Select a ticker from the watchlist." />;
  }

  return (
    <div className="chain-view">
      <div className="panel-toolbar">
        <div>
          <span className="eyebrow">Underlying</span>
          <strong>{data.underlyingPrice?.toFixed(2) ?? "--"}</strong>
        </div>
        <label className="field">
          <span>Expiry</span>
          <select value={expiry} onChange={(event) => onExpiryChange(event.target.value)}>
            {data.expiries.map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chain-table-wrap">
        <table className="chain-table">
          <thead>
            <tr className="group-row">
              <th colSpan="7">Calls</th>
              <th>Strike</th>
              <th colSpan="7">Puts</th>
            </tr>
            <tr>
              <th>Bid</th>
              <th>Ask</th>
              <th>Last</th>
              <th>Vol</th>
              <th>OI</th>
              <th>IV</th>
              <th>Delta</th>
              <th className="strike-col">Strike</th>
              <th>Delta</th>
              <th>IV</th>
              <th>OI</th>
              <th>Vol</th>
              <th>Last</th>
              <th>Ask</th>
              <th>Bid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isAtm = row.strike === data.atmStrike;
              return (
                <tr className={isAtm ? "atm-row" : ""} key={row.strike}>
                  <OptionCells contract={row.call} side="call" />
                  <td className="strike-col">{formatDecimal(row.strike, 2)}</td>
                  <OptionCells contract={row.put} side="put" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OptionCells({ contract, side }) {
  if (!contract) {
    return Array.from({ length: 7 }).map((_, index) => <td key={`${side}-${index}`}>--</td>);
  }

  const cells =
    side === "call"
      ? [
          formatDecimal(contract.bid),
          formatDecimal(contract.ask),
          formatDecimal(contract.last),
          formatNumber(contract.volume),
          formatNumber(contract.openInterest),
          formatIv(contract.impliedVolatility),
          formatDecimal(contract.delta, 2)
        ]
      : [
          formatDecimal(contract.delta, 2),
          formatIv(contract.impliedVolatility),
          formatNumber(contract.openInterest),
          formatNumber(contract.volume),
          formatDecimal(contract.last),
          formatDecimal(contract.ask),
          formatDecimal(contract.bid)
        ];

  return cells.map((value, index) => <td key={`${side}-${index}`}>{value}</td>);
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
