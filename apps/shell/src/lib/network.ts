// Reads the network-traffic-analyzer's Flask API (all /api/ routes require its
// session auth — 401 otherwise). Prod: Caddy routes /api/network/* to the
// analyzer (prefix stripped). Returns null when unreachable/unauthorized so the
// Network tab degrades to a "not connected" state instead of erroring.
const BASE = (import.meta.env.VITE_NETWORK_URL as string | undefined) ?? '/api/network/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface NetOverview {
	status: string; // live | idle | no_data
	packetsPerSec: number | null;
	totalPackets: number | null;
	iface: string | null;
	deviceCount: number | null;
	openAlerts: number | null;
	trend: { label: string; value: number }[]; // total packets per run (oldest→newest)
	protocols: { name: string; value: number }[]; // sorted desc
	talkers: { name: string; packets: number }[]; // top devices
}

async function j(path: string): Promise<unknown> {
	const r = await fetch(`${BASE}${path}`, {
		credentials: 'include',
		headers: { accept: 'application/json' }
	});
	if (!r.ok) throw new Error(String(r.status));
	return r.json();
}

export async function fetchNetwork(): Promise<NetOverview | null> {
	try {
		const [live, runs, seen] = await Promise.all([
			j('/live').catch(() => null),
			j('/runs').catch(() => null),
			j('/seen-devices').catch(() => null)
		]);
		if (!live && !runs) return null; // unreachable / unauthorized

		const runArr: Any[] = Array.isArray(runs) ? runs : [];
		// runs come newest-first; chart oldest→newest, last 20
		const ordered = [...runArr].reverse().slice(-20);
		const trend = ordered.map((r) => ({
			label: r.analysis_time ?? r.run_id ?? '',
			value: r.total_packets ?? 0
		}));

		const latest = runArr[0] ?? {};
		const protoObj: Record<string, number> = latest.protocol_stats ?? {};
		const protocols = Object.entries(protoObj)
			.map(([name, value]) => ({ name, value: Number(value) || 0 }))
			.sort((a, b) => b.value - a.value)
			.slice(0, 6);

		const devices: Any[] = Array.isArray(seen) ? seen : [];
		const talkers = [...devices]
			.sort((a, b) => (b.packet_count ?? 0) - (a.packet_count ?? 0))
			.slice(0, 6)
			.map((d) => ({
				name: d.name || d.hostname || d.ip || '—',
				packets: d.packet_count ?? 0
			}));

		return {
			status: (live as Any)?.status ?? (runArr.length ? 'idle' : 'no_data'),
			packetsPerSec: (live as Any)?.packets_per_second ?? null,
			totalPackets: (live as Any)?.total_packets ?? latest.total_packets ?? null,
			iface: (live as Any)?.interface ?? latest.interface ?? null,
			deviceCount: devices.length || null,
			openAlerts: latest.unresolved_count ?? null,
			trend,
			protocols,
			talkers
		};
	} catch {
		return null;
	}
}
