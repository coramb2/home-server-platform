// Reads host metrics from a Glances agent (glances -w REST API v4).
// Prod: Caddy routes /api/metrics/* to glances (prefix stripped) -> /api/4/*.
// Dev: set VITE_METRICS_URL to a reachable Glances, or leave it — the dashboard
// degrades gracefully to "agent not connected".
const BASE = (import.meta.env.VITE_METRICS_URL as string | undefined) ?? '/api/metrics/api/4';

export interface HostMetrics {
	cpu: number | null; // %
	memPct: number | null; // %
	memUsed: number | null; // bytes
	memTotal: number | null; // bytes
	diskFreeGb: number | null;
	diskPct: number | null;
	tempC: number | null;
	uptime: string | null;
}

async function j(path: string): Promise<unknown> {
	const r = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
	if (!r.ok) throw new Error(String(r.status));
	return r.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export async function fetchMetrics(): Promise<HostMetrics | null> {
	try {
		const [cpu, mem, fs, sensors, uptime] = await Promise.all([
			j('/cpu').catch(() => null),
			j('/mem').catch(() => null),
			j('/fs').catch(() => null),
			j('/sensors').catch(() => null),
			j('/uptime').catch(() => null)
		]);
		if (!cpu && !mem) return null; // agent unreachable

		let diskFreeGb: number | null = null;
		let diskPct: number | null = null;
		if (Array.isArray(fs) && fs.length) {
			const root =
				(fs as Any[]).find((f) => f.mnt_point === '/') ??
				[...(fs as Any[])].sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];
			if (root) {
				diskFreeGb = (root.free ?? 0) / 1e9;
				diskPct = root.percent ?? null;
			}
		}

		let tempC: number | null = null;
		if (Array.isArray(sensors)) {
			const t = (sensors as Any[]).find(
				(s) => (s.unit === 'C' || s.type === 'temperature_core') && typeof s.value === 'number'
			);
			if (t) tempC = Math.round(t.value);
		}

		let up: string | null = null;
		if (typeof uptime === 'string') up = uptime;
		else if (uptime && typeof (uptime as Any).seconds === 'number')
			up = fmtUptime((uptime as Any).seconds);

		return {
			cpu: (cpu as Any)?.total ?? null,
			memPct: (mem as Any)?.percent ?? null,
			memUsed: (mem as Any)?.used ?? null,
			memTotal: (mem as Any)?.total ?? null,
			diskFreeGb,
			diskPct,
			tempC,
			uptime: up
		};
	} catch {
		return null;
	}
}

export function fmtGiB(bytes: number | null): string {
	if (bytes == null) return '—';
	return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

function fmtUptime(sec: number): string {
	const d = Math.floor(sec / 86400);
	const h = Math.floor((sec % 86400) / 3600);
	if (d > 0) return `${d}d ${h}h`;
	const m = Math.floor((sec % 3600) / 60);
	return `${h}h ${m}m`;
}
