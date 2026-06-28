export function formatCurrency(value) {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 2 : 4
  }).format(value);
}

export function formatNumber(value) {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatCompact(value) {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export function formatPercent(value, digits = 2) {
  if (value == null) return "--";
  return `${value.toFixed(digits)}%`;
}

export function formatIv(value) {
  if (value == null) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatSignedPercent(value) {
  if (value == null) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatDecimal(value, digits = 2) {
  if (value == null) return "--";
  return Number(value).toFixed(digits);
}

export function timeAgo(timestamp) {
  if (!timestamp) return "";
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
