export async function fetchJson(path) {
  return request(path);
}

export async function postJson(path, body) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function request(path, options) {
  const response = await fetch(path, options);
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = normalizeError(payload?.detail) || response.statusText || "Request failed";
    throw new Error(message);
  }

  return payload;
}

// FastAPI returns string details for our raised HTTPExceptions, but pydantic
// validation errors come back as a list of objects — flatten those to a message.
function normalizeError(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || "").filter(Boolean).join("; ");
  }
  return "";
}
