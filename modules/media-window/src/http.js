// Shared HTTP helper: timeout, status check BEFORE parsing, no secrets in errors.
export async function requestJson(url, { method = 'GET', headers = {}, body, timeoutMs = 10_000 } = {}) {
	const res = await fetch(url, {
		method,
		headers: {
			Accept: 'application/json',
			...(body ? { 'Content-Type': 'application/json' } : {}),
			...headers
		},
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(timeoutMs)
	});
	const where = `${method} ${new URL(url).pathname}`; // path only, never query strings or headers
	const text = await res.text();
	if (!res.ok) throw new Error(`${where} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`${where} -> not JSON: ${text.slice(0, 100)}`);
	}
}
