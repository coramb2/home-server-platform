// Parses "57-71, 91-112, 271" into a Set of episode numbers. Rejects anything else.
export function parseRanges(text, where) {
	const out = new Set();
	if (text === undefined || text === '') return out;
	if (typeof text !== 'string') throw new Error(`${where} must be text like "57-71, 271"`);
	for (const part of text.split(',')) {
		const p = part.trim();
		if (!p) continue;
		const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(p);
		if (!m) throw new Error(`${where}: "${p}" is not a number or a range`);
		const from = Number(m[1]);
		const to = Number(m[2] ?? m[1]);
		if (from < 1 || to < from || to - from > 2000) throw new Error(`${where}: bad range "${p}"`);
		for (let n = from; n <= to; n++) out.add(n);
	}
	return out;
}
