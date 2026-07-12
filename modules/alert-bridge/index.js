import 'dotenv/config';
import PocketBase from 'pocketbase';

const {
	PB_URL = 'http://127.0.0.1:8090',
	PB_ADMIN_EMAIL,
	PB_ADMIN_PASSWORD,
	ANALYZER_URL = 'http://127.0.0.1:8080',
	ANALYZER_PASSWORD,
	POLL_SECONDS = '60',
	RUNS_TO_SCAN = '5',
	SECURITY_ASSIGNEE = '' // user id; empty = unassigned (no push — keeps it off the household's notifications)
} = process.env;

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

const PRIO = { HIGH: 'P1', MEDIUM: 'P2', LOW: 'P3' };

// ── analyzer session auth (all its /api routes require login) ────────────
let cookie = '';
async function analyzerLogin() {
	const r = await fetch(`${ANALYZER_URL}/login`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ password: ANALYZER_PASSWORD ?? '' }),
		redirect: 'manual'
	});
	const sc = r.headers.get('set-cookie');
	if (sc) cookie = sc.split(';')[0];
}
async function aget(path) {
	let r = await fetch(`${ANALYZER_URL}${path}`, { headers: { accept: 'application/json', cookie } });
	if (r.status === 401) {
		await analyzerLogin();
		r = await fetch(`${ANALYZER_URL}${path}`, { headers: { accept: 'application/json', cookie } });
	}
	if (!r.ok) throw new Error(`${path} -> ${r.status}`);
	return r.json();
}

function ticketFrom(a) {
	const type = a.type || 'ALERT';
	const src = a.source_ip ? ` from ${a.source_ip}` : '';
	const title = `[${type}]${src} ${a.description || ''}`.trim().slice(0, 200);
	const lines = [];
	if (a.description) lines.push(a.description);
	if (a.details) lines.push(a.details);
	if (a.source_ip) lines.push(`Source: ${a.source_ip}`);
	if (a.destination_ip) lines.push(`Destination: ${a.destination_ip}`);
	if (a.destination_port) lines.push(`Port: ${a.destination_port}`);
	if (Array.isArray(a.firewall_suggestions) && a.firewall_suggestions.length)
		lines.push('Firewall suggestions:\n' + a.firewall_suggestions.join('\n'));
	lines.push(`\nSeverity: ${a.severity || '?'} · auto-filed by the network alert bridge`);
	return {
		title,
		description: lines.join('\n'),
		status: 'Open',
		category: 'security',
		priority: PRIO[a.severity] || 'P3',
		ext_key: a.alert_key,
		...(SECURITY_ASSIGNEE ? { assignee: SECURITY_ASSIGNEE } : {})
	};
}

async function alreadyFiled(key) {
	try {
		await pb.collection('tickets').getFirstListItem(pb.filter('ext_key = {:k}', { k: key }));
		return true;
	} catch {
		return false; // 404 = not filed yet
	}
}

async function poll() {
	const runs = await aget('/api/runs');
	const recent = (Array.isArray(runs) ? runs : [])
		.slice(0, Number(RUNS_TO_SCAN))
		.filter((r) => (r.unresolved_count || 0) > 0);
	let created = 0;
	for (const run of recent) {
		const detail = await aget(`/api/runs/${run.run_id}`);
		const alerts = Array.isArray(detail.alerts) ? detail.alerts : [];
		for (const a of alerts) {
			if (a.resolved || !a.alert_key) continue;
			if (await alreadyFiled(a.alert_key)) continue; // dedup: one ticket per alert_key
			await pb.collection('tickets').create(ticketFrom(a));
			created++;
			console.log(`[bridge] filed security ticket: ${a.type} (${a.alert_key})`);
		}
	}
	if (created) console.log(`[bridge] created ${created} ticket(s) this poll`);
}

async function main() {
	await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
	await analyzerLogin();
	console.log(`[bridge] ${ANALYZER_URL} -> security tickets on ${PB_URL} (every ${POLL_SECONDS}s)`);
	const run = () => poll().catch((e) => console.warn('[bridge] poll error:', e.message));
	await run();
	setInterval(run, Number(POLL_SECONDS) * 1000);
}

main().catch((e) => {
	console.error('[bridge] fatal:', e);
	process.exit(1);
});
