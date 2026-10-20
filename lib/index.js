// Host half of the dsh-app-usage plugin. Zero dependencies by design.
// It mirrors ZCode's "App Usage" tab from the local session records of this
// device, unfiltered: tokens per day/provider/model, tool-call counts, active
// time per day and decode-speed telemetry from the recorded stream timings.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const name = "app-usage";
/**
 * Plugin state lives in the Harness home, never in a user project directory:
 * a snapshot written into a workspace shows up as an "edited file" in every
 * project and pollutes repositories.
 */
const harnessHome = process.env.DSH_HOME ?? path.join(os.homedir(), ".dsh");
const usageDir = path.join(harnessHome, "usage");
const SNAPSHOT_PATH = path.join(usageDir, "app-usage.json");
const POLL_MS = 5 * 60 * 1000;
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
/** A gap longer than this between two records counts as idle time, not usage. */
const ACTIVE_GAP_MS = 5 * 60 * 1000;
const sessionsRoot = process.env.DSH_SESSIONS_ROOT ?? path.join(os.homedir(), ".dsh", "sessions");
const logCache = new Map();

/** Decode one session log (plaintext JSONL or multi-frame zstd JSONL) to text. */
function decodeLog(buf) {
	if (buf.subarray(0, 4).equals(ZSTD_MAGIC) === false && buf[0] === 0x7b /* '{' */) return buf.toString("utf8");
	const bounds = [0];
	for (let i = 1; i <= buf.length - 4; i++) {
		if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) bounds.push(i);
	}
	bounds.push(buf.length);
	const chunks = [];
	for (let k = 0; k < bounds.length - 1; k++) {
		const start = bounds[k];
		let end = bounds[k + 1];
		if (end - start < 6) continue;
		for (;;) {
			try {
				chunks.push(zlib.zstdDecompressSync(buf.subarray(start, end)));
				break;
			} catch (error) {
				if (end >= buf.length || k === 0) throw error;
				const next = bounds.indexOf(end);
				end = next >= 0 && next + 1 < bounds.length ? bounds[next + 1] : buf.length;
				if (end <= bounds[k + 1]) throw error;
			}
		}
	}
	return Buffer.concat(chunks).toString("utf8");
}

/** Sum every recorded chunk delta time (ms) of one assistant message. */
function streamMillis(stream) {
	if (Array.isArray(stream) === false) return 0;
	let ms = 0;
	for (const entry of stream) {
		if (Array.isArray(entry?.dt) === false) continue;
		for (const delta of entry.dt) if (Number.isFinite(delta)) ms += delta;
	}
	return ms;
}

/** Parse one session log into the per-day aggregate fragment. */
function parseLog(text) {
	const fragment = { days: new Map(), tools: new Map(), speed: new Map(), activity: new Map() };
	// Activity is recorded as blocks of consecutive records (gaps over
	// ACTIVE_GAP_MS split a block), so parallel sessions can be unioned later.
	const touch = (day, time) => {
		const entry = fragment.activity.get(day) ?? { first: time, last: time, blocks: [], open: null, prev: null };
		if (entry.open === null) entry.open = time;
		else if (time - entry.prev > ACTIVE_GAP_MS) {
			entry.blocks.push([entry.open, entry.prev]);
			entry.open = time;
		}
		entry.first = Math.min(entry.first, time);
		entry.last = Math.max(entry.last, time);
		entry.prev = time;
		fragment.activity.set(day, entry);
	};
	for (const line of text.split("\n")) {
		if (line.length < 2) continue;
		let record;
		try {
			record = JSON.parse(line);
		} catch {
			continue;
		}
		const time = Number(record?.time);
		if (Number.isFinite(time) === false) continue;
		const day = new Date(time).toISOString().slice(0, 10);
		touch(day, time);

		if (record.type === "tool/call") {
			const tool = String(record.data?.name ?? "unknown");
			const bucket = fragment.tools.get(day) ?? new Map();
			bucket.set(tool, (bucket.get(tool) ?? 0) + 1);
			fragment.tools.set(day, bucket);
			continue;
		}
		if (record.type !== "assistant/message") continue;

		const usage = record.data?.usage;
		if (!usage) continue;
		const source = record.data?.message?.source ?? {};
		const provider = String(source.provider ?? "unknown");
		const model = String(source.model ?? record.data?.model ?? "unknown");
		const dayBucket = fragment.days.get(day) ?? new Map();
		const providerBucket = dayBucket.get(provider) ?? new Map();
		const sum = providerBucket.get(model) ?? { input: 0, output: 0, cache: 0, total: 0 };
		sum.input += Number(usage.inputTokens ?? 0);
				sum.output += Number(usage.outputTokens ?? 0);
		// The provider's total also carries the prompt cache it re-read; keep it apart.
		sum.cache += Number(usage.cacheReadTokens ?? 0);
		sum.total += Number(usage.totalTokens ?? Number(usage.inputTokens ?? 0) + Number(usage.outputTokens ?? 0));
		providerBucket.set(model, sum);
		dayBucket.set(provider, providerBucket);
		fragment.days.set(day, dayBucket);

		// Decode speed: output tokens over the streamed generation time.
		const ms = streamMillis(record.data?.stream);
		const outputTokens = Number(usage.outputTokens ?? 0);
		if (ms > 0 && outputTokens > 0) {
			const speedBucket = fragment.speed.get(day) ?? new Map();
			const entry = speedBucket.get(model) ?? { tokens: 0, ms: 0, samples: 0 };
			entry.tokens += outputTokens;
			entry.ms += ms;
			entry.samples += 1;
			speedBucket.set(model, entry);
			fragment.speed.set(day, speedBucket);
		}
	}
	return fragment;
}

/** Deep-merge a per-file fragment into the run aggregate. */
function absorbLog(file, stats, aggregate) {
	const mergeFragment = (fragment) => {
		// days: day -> provider -> model -> {input, output, total}
		for (const [day, providers] of fragment.days) {
			const dayTarget = aggregate.days.get(day) ?? new Map();
			for (const [provider, models] of providers) {
				const providerTarget = dayTarget.get(provider) ?? new Map();
				for (const [model, sum] of models) {
					const existing = providerTarget.get(model);
					providerTarget.set(
						model,
						existing === undefined
							? { ...sum }
							: { input: existing.input + sum.input, output: existing.output + sum.output, cache: existing.cache + sum.cache, total: existing.total + sum.total },
					);
				}
				dayTarget.set(provider, providerTarget);
			}
			aggregate.days.set(day, dayTarget);
		}
		// tools: day -> tool -> count
		for (const [day, byTool] of fragment.tools) {
			const dayTarget = aggregate.tools.get(day) ?? new Map();
			for (const [tool, count] of byTool) dayTarget.set(tool, (dayTarget.get(tool) ?? 0) + count);
			aggregate.tools.set(day, dayTarget);
		}
		// speed: day -> model -> {tokens, ms, samples}
		for (const [day, byModel] of fragment.speed) {
			const dayTarget = aggregate.speed.get(day) ?? new Map();
			for (const [model, entry] of byModel) {
				const existing = dayTarget.get(model);
				dayTarget.set(
					model,
					existing === undefined
						? { ...entry }
						: { tokens: existing.tokens + entry.tokens, ms: existing.ms + entry.ms, samples: existing.samples + entry.samples },
				);
			}
			aggregate.speed.set(day, dayTarget);
		}
		// activity: day -> {first, last, blocks: [[start, end], ...]}
		for (const [day, value] of fragment.activity) {
			const blocks = value.open === null ? [...value.blocks] : [...value.blocks, [value.open, value.prev]];
			const existing = aggregate.activity.get(day);
			if (existing === undefined) {
				aggregate.activity.set(day, { first: value.first, last: value.last, blocks });
				continue;
			}
			existing.first = Math.min(existing.first, value.first);
			existing.last = Math.max(existing.last, value.last);
			existing.blocks.push(...blocks);
		}
	};
	const cached = logCache.get(file);
	if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
		mergeFragment(cached.fragment);
		return;
	}
	let text;
	try {
		text = decodeLog(fs.readFileSync(file));
	} catch {
		return; // unreadable/corrupt log: skip silently, retry next poll
	}
	const fragment = parseLog(text);
	logCache.set(file, { mtimeMs: stats.mtimeMs, size: stats.size, fragment });
	if (logCache.size > 4096) logCache.delete(logCache.keys().next().value);
	mergeFragment(fragment);
}

/** Collect every stored session log into one aggregate. */
function aggregateLocal() {
	const aggregate = { days: new Map(), tools: new Map(), speed: new Map(), activity: new Map() };
	const providers = new Set();
	let sessions = 0;
	let entries;
	try {
		entries = fs.readdirSync(sessionsRoot, { withFileTypes: true });
	} catch {
		return { ...aggregate, providers: [], sessions };
	}
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const workspaceDir = path.join(sessionsRoot, entry.name);
		let sessionIds;
		try {
			sessionIds = fs.readdirSync(workspaceDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const session of sessionIds) {
			if (!session.isDirectory()) continue;
			const sessionDir = path.join(workspaceDir, session.name);
			for (const suffix of ["session.v4.jsonl.zstd", "session.v4.jsonl"]) {
				const file = path.join(sessionDir, suffix);
				let stats;
				try {
					stats = fs.statSync(file);
				} catch {
					continue;
				}
				sessions += 1;
				absorbLog(file, stats, aggregate);
				break;
			}
		}
	}
	for (const providersOfDay of aggregate.days.values()) for (const provider of providersOfDay.keys()) providers.add(provider);
	return { ...aggregate, providers: [...providers].sort(), sessions };
}

/** Write the snapshot into the Harness home (never into a project folder). */
function writeSnapshot(snapshot) {
	fs.mkdirSync(usageDir, { recursive: true });
	fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot));
	return SNAPSHOT_PATH;
}

/** Serialize the aggregate into the client snapshot shape (plain JSON maps). */
function buildSnapshot(local) {
	const days = {};
	for (const [day, providers] of [...local.days.entries()].sort()) {
		const providerRecord = {};
		for (const [provider, models] of [...providers.entries()].sort()) {
			providerRecord[provider] = Object.fromEntries([...models.entries()].sort());
		}
		days[day] = providerRecord;
	}
	const tools = {};
	for (const [day, byTool] of [...local.tools.entries()].sort()) tools[day] = Object.fromEntries([...byTool.entries()].sort());
	const speed = {};
	for (const [day, byModel] of [...local.speed.entries()].sort()) speed[day] = Object.fromEntries([...byModel.entries()].sort());
	const activity = {};
	for (const [day, value] of [...local.activity.entries()].sort()) {
		// Union of every session's activity blocks: parallel sessions must not
		// double-count the same wall-clock minute.
		const sorted = [...value.blocks].sort((a, b) => a[0] - b[0]);
		let activeMs = 0;
		let current = null;
		for (const [start, end] of sorted) {
			if (current === null) {
				current = [start, end];
				continue;
			}
			if (start <= current[1]) {
				current[1] = Math.max(current[1], end);
				continue;
			}
			activeMs += current[1] - current[0];
			current = [start, end];
		}
		if (current !== null) activeMs += current[1] - current[0];
		activity[day] = { first: value.first, last: value.last, activeMs: Math.round(activeMs) };
	}
	return {
		generatedAt: Date.now(),
		days,
		tools,
		speed,
		activity,
		providers: local.providers,
		sessions: local.sessions,
	};
}

function apply(ctx) {
	ctx.effect(() => {
		const running = { current: false };
		const run = async () => {
			if (running.current) return;
			running.current = true;
			try {
				const local = aggregateLocal();
				const snapshot = buildSnapshot(local);
				snapshot.path = SNAPSHOT_PATH;
				const written = writeSnapshot(snapshot);
				console.log(`[app-usage] snapshot written to ${written} (${local.providers.length} provider(s), ${local.sessions} sessions)`);
			} catch (error) {
				console.error(`[app-usage] refresh failed: ${String(error)}`);
			} finally {
				running.current = false;
			}
		};
		void run();
		const timer = setInterval(() => void run(), POLL_MS);
		return () => clearInterval(timer);
	}, "app-usage: snapshot poll");
}

export { SNAPSHOT_PATH, apply, name };
