<script lang="ts">
	// Placeholder — Sprint 5 rebuilds this against the traffic-analyzer's
	// /api/network/* endpoints and wires curated alerts into security tickets.
</script>

<div class="placeholder">
	<h1>📡 Network</h1>
	<p>Live traffic + threat monitoring from the home network analyzer will live here.</p>
	<ul>
		<li>Live packet rate, protocol mix, top talkers</li>
		<li>Open security alerts, with allowlisting</li>
		<li>Curated alerts auto-file as <code>security</code> tickets</li>
	</ul>
	<p class="tag">Planned · Sprint 5</p>
</div>

<style>
	.placeholder {
		max-width: 560px;
		margin: 2rem auto;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.75rem;
	}
	h1 {
		margin-top: 0;
	}
	ul {
		color: var(--muted);
		line-height: 1.8;
	}
	code {
		background: var(--surface-3);
		padding: 0.05rem 0.35rem;
		border-radius: 5px;
	}
	.tag {
		color: var(--accent);
		font-weight: 600;
	}
</style>
