// Pure chart-option builders shared by App.vue and the smoke tests.
// Input shape: days = { "YYYY-MM-DD": { provider: { model: {input,output,total} } } }
// Nothing here filters by provider name — the UI decides what is enabled.

const PROVIDER_COLORS = ["#4f8ef7", "#34d399", "#8b5cf6", "#f59e0b", "#f472b6", "#22d3ee", "#a78bfa", "#fbbf24"];

export function providerColor(index) {
	return PROVIDER_COLORS[index % PROVIDER_COLORS.length];
}

export function fmt(n) {
	const value = Number(n ?? 0);
	if (value >= 1e9) return (value / 1e9).toFixed(value >= 1e10 ? 0 : 1) + "B";
	if (value >= 1e6) return (value / 1e6).toFixed(value >= 1e7 ? 0 : 1) + "M";
	if (value >= 1e3) return (value / 1e3).toFixed(0) + "K";
	return String(value);
}

/** Last `count` days as [{date, providers}], ascending. */
export function dayList(daysObject, count) {
	const raw = daysObject ?? {};
	return Object.entries(raw).map(([date, providers]) => ({ date, providers })).slice(-count);
}

/** Every provider seen in the window, sorted. */
export function providerNames(days) {
	const names = new Set();
	for (const day of days) for (const provider of Object.keys(day.providers ?? {})) names.add(provider);
	return [...names].sort((a, b) => a.localeCompare(b));
}

/** Per-provider totals over the window, restricted to `enabled` providers. */
export function providerTotals(days, enabled) {
	const totals = new Map();
	for (const day of days) {
		for (const [provider, models] of Object.entries(day.providers ?? {})) {
			if (enabled != null && enabled.has(provider) === false) continue;
			const entry = totals.get(provider) ?? { provider, total: 0, models: new Map() };
			for (const [model, sum] of Object.entries(models ?? {})) {
				const total = Number(sum?.total ?? 0);
				entry.total += total;
				entry.models.set(model, (entry.models.get(model) ?? 0) + total);
			}
			totals.set(provider, entry);
		}
	}
	return [...totals.values()]
		.map((entry) => ({
			provider: entry.provider,
			total: entry.total,
			models: [...entry.models.entries()].map(([model, total]) => ({ model, total })).sort((a, b) => b.total - a.total),
		}))
		.filter((entry) => entry.total > 0)
		.sort((a, b) => b.total - a.total);
}

/** Model totals across every enabled provider (used by the single-provider donut). */
export function modelTotals(days, enabled) {
	const totals = new Map();
	for (const day of days) {
		for (const [provider, models] of Object.entries(day.providers ?? {})) {
			if (enabled != null && enabled.has(provider) === false) continue;
			for (const [model, sum] of Object.entries(models ?? {})) {
				const label = provider === [...(enabled ?? [provider])][0] ? model : `${provider} · ${model}`;
				totals.set(label, (totals.get(label) ?? 0) + Number(sum?.total ?? 0));
			}
		}
	}
	return [...totals.entries()].map(([name, value]) => ({ name, value })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
}

/** Daily stacked bars, one series per enabled provider. */
export function buildDailyOption(days, enabled, colorOf) {
	const providers = providerNames(days).filter((provider) => enabled == null || enabled.has(provider));
	return {
		backgroundColor: "transparent",
		textStyle: { color: "#9a9a9a", fontSize: 11 },
		tooltip: { trigger: "axis", textStyle: { fontSize: 11 }, valueFormatter: (value) => fmt(value) },
		legend: { top: 0, textStyle: { color: "#9a9a9a", fontSize: 11 }, icon: "circle", itemWidth: 8, itemHeight: 8 },
		grid: { left: 48, right: 8, top: 26, bottom: 22 },
		xAxis: {
			type: "category",
			data: days.map((day) => day.date.slice(5)),
			axisLine: { lineStyle: { color: "#333" } },
			axisLabel: { color: "#9a9a9a", fontSize: 10 },
		},
		yAxis: {
			type: "value",
			splitLine: { lineStyle: { color: "#262626" } },
			axisLabel: { color: "#9a9a9a", fontSize: 10, formatter: (value) => fmt(value) },
		},
		series: providers.map((provider) => ({
			name: provider,
			type: "bar",
			stack: "tokens",
			barMaxWidth: 18,
			itemStyle: { color: colorOf(provider), borderRadius: [3, 3, 0, 0] },
			data: days.map((day) => {
				let total = 0;
				for (const sum of Object.values(day.providers?.[provider] ?? {})) total += Number(sum?.total ?? 0);
				return total;
			}),
		})),
	};
}

/** Donut over rows [{name, value}], colored by index or a supplied color. */
export function buildDonutOption(rows, colorOf) {
	return {
		backgroundColor: "transparent",
		textStyle: { color: "#9a9a9a", fontSize: 11 },
		tooltip: {
			trigger: "item",
			textStyle: { fontSize: 11 },
			formatter: (params) => `${params.name}<br/>${fmt(params.value)} tokens (${params.percent}%)`,
		},
		legend: { bottom: 0, textStyle: { color: "#9a9a9a", fontSize: 11 }, icon: "circle", itemWidth: 8, itemHeight: 8, type: "scroll" },
		series: [
			{
				type: "pie",
				radius: ["52%", "74%"],
				center: ["50%", "42%"],
				label: { show: false },
				itemStyle: { borderColor: "#1b1b1b", borderWidth: 2 },
				data: rows.map((row, index) => ({
					name: row.name,
					value: row.value,
					itemStyle: { color: colorOf != null ? colorOf(row.name, index) : providerColor(index) },
				})),
			},
		],
	};
}

/**
 * Calendar heatmap; `valuesOverride` supplies the weekly/cumulative modes.
 * `cellSize` may be supplied by the caller (measured panel width / weeks): a
 * calendar box constrained on BOTH sides lets ECharts stretch cells into
 * rectangles, so only `left`/`top` are positioned here and the size comes from
 * the square cell edge.
 */
export function buildHeatmapOption(days, enabled, valuesOverride, cellSize = 14) {
	const dayMs = 86400000;
	const values = valuesOverride ?? days.map((day) => {
		let total = 0;
		for (const [provider, models] of Object.entries(day.providers ?? {})) {
			if (enabled != null && enabled.has(provider) === false) continue;
			for (const sum of Object.values(models ?? {})) total += Number(sum?.total ?? 0);
		}
		return [day.date, total];
	});
	// Always render a full year, like ZCode's activity graph: a short data range
	// with an "auto" cell width would stretch each day into a full-width bar.
	const today = new Date().toISOString().slice(0, 10);
	const oneYearAgo = new Date(Date.now() - 365 * dayMs).toISOString().slice(0, 10);
	const dataStart = days[0]?.date;
	const dataEnd = days[days.length - 1]?.date;
	// Widest of (a year ago, the oldest record); latest of (today, newest record).
	const first = dataStart != null && dataStart < oneYearAgo ? dataStart : oneYearAgo;
	const last = dataEnd != null && dataEnd > today ? dataEnd : today;
	const max = Math.max(1, ...values.map((item) => item[1]));
	return {
		backgroundColor: "transparent",
		textStyle: { color: "#9a9a9a", fontSize: 11 },
		tooltip: {
			formatter: (params) => `${params.value[0]}<br/>${fmt(params.value[1])} tokens`,
			backgroundColor: "#2b2b2b",
			borderColor: "#3a3a3a",
			borderWidth: 1,
			padding: [6, 10],
			textStyle: { color: "#e8e8e8", fontSize: 11 },
			extraCssText: "border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.45);",
		},
		visualMap: { show: false, min: 0, max, inRange: { color: ["#1f2937", "#2563eb", "#93c5fd"] } },
		calendar: {
			top: 26,
			left: 34,
			// Fixed SQUARE cells: `right`/`bottom` are deliberately absent, since a
			// bounded box makes ECharts stretch the grid into rectangles.
			cellSize: Math.max(8, Math.min(24, Math.round(cellSize))),
			range: [first, last],
			splitLine: { show: false },
			itemStyle: { color: "#232323", borderColor: "#1b1b1b", borderRadius: 3 },
			yearLabel: { show: false },
			monthLabel: { color: "#9a9a9a", fontSize: 10, margin: 6 },
			dayLabel: { color: "#666", fontSize: 9, margin: 6, nameMap: ["S", "M", "T", "W", "T", "F", "S"] },
		},
		series: [{ type: "heatmap", coordinateSystem: "calendar", data: values }],
	};
}

// ── Activity, tools and decode-speed builders ────────────────────────────────

/** Total tokens per day across enabled providers, for the whole history. */
export function dayTotals(days, enabled) {
	return days.map((day) => {
		let total = 0;
		for (const [provider, models] of Object.entries(day.providers ?? {})) {
			if (enabled != null && enabled.has(provider) === false) continue;
			for (const sum of Object.values(models ?? {})) total += Number(sum?.total ?? 0);
		}
		return { date: day.date, total };
	});
}

/** Streak statistics over consecutive active calendar days. */
export function streaks(days, enabled) {
	const totals = dayTotals(days, enabled);
	const active = totals.filter((day) => day.total > 0).map((day) => day.date);
	if (active.length === 0) return { current: 0, longest: 0, activeDays: 0 };
	const dayMs = 86400000;
	let longest = 1;
	let run = 1;
	for (let index = 1; index < active.length; index++) {
		const gap = Date.parse(active[index]) - Date.parse(active[index - 1]);
		run = gap === dayMs ? run + 1 : 1;
		longest = Math.max(longest, run);
	}
	// The current streak counts only while it reaches today or yesterday.
	const lastGap = Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(active[active.length - 1]);
	const current = lastGap <= dayMs ? run : 0;
	return { current, longest, activeDays: active.length };
}

/** The Activity row: totals, peak day, active usage time and streaks. */
export function activityKpis(days, enabled, activity) {
	const totals = dayTotals(days, enabled);
	const total = totals.reduce((sum, day) => sum + day.total, 0);
	let peak = 0;
	let peakDate = null;
	for (const day of totals) {
		if (day.total > peak) {
			peak = day.total;
			peakDate = day.date;
		}
	}
	let durationMs = 0;
	for (const [date, value] of Object.entries(activity ?? {})) {
		const hasTokens = totals.find((day) => day.date === date)?.total > 0;
		if (hasTokens) durationMs += Number(value?.activeMs ?? 0);
	}
	return { total, peak, peakDate, durationMs, ...streaks(days, enabled) };
}

/** Human duration: "32d 22h 16m". */
export function fmtDuration(ms) {
	const minutes = Math.floor(Number(ms ?? 0) / 60000);
	const d = Math.floor(minutes / 1440);
	const h = Math.floor((minutes % 1440) / 60);
	const m = minutes % 60;
	return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Tool-call totals over a window: [{tool, total}] descending. */
export function toolTotals(days, tools) {
	const totals = new Map();
	for (const day of days) {
		for (const [tool, count] of Object.entries(tools?.[day.date] ?? {})) {
			totals.set(tool, (totals.get(tool) ?? 0) + Number(count ?? 0));
		}
	}
	return [...totals.entries()].map(([tool, total]) => ({ tool, total })).sort((a, b) => b.total - a.total);
}

/** Daily stacked bars of tool calls, one series per tool (top N, rest merged). */
export function buildToolsOption(days, tools, topN = 6) {
	const ranked = toolTotals(days, tools);
	const top = ranked.slice(0, topN).map((row) => row.tool);
	const others = ranked.slice(topN).map((row) => row.tool);
	const seriesNames = others.length > 0 ? [...top, "other"] : top;
	const valueOf = (date, tool) => Number(tools?.[date]?.[tool] ?? 0);
	return {
		backgroundColor: "transparent",
		textStyle: { color: "#9a9a9a", fontSize: 11 },
		tooltip: { trigger: "axis", textStyle: { fontSize: 11 } },
		legend: { top: 0, textStyle: { color: "#9a9a9a", fontSize: 11 }, icon: "circle", itemWidth: 8, itemHeight: 8 },
		grid: { left: 44, right: 8, top: 26, bottom: 22 },
		xAxis: {
			type: "category",
			data: days.map((day) => day.date.slice(5)),
			axisLine: { lineStyle: { color: "#333" } },
			axisLabel: { color: "#9a9a9a", fontSize: 10 },
		},
		yAxis: {
			type: "value",
			splitLine: { lineStyle: { color: "#262626" } },
			axisLabel: { color: "#9a9a9a", fontSize: 10 },
		},
		series: seriesNames.map((name, index) => ({
			name,
			type: "bar",
			stack: "tools",
			barMaxWidth: 18,
			itemStyle: { color: providerColor(index), borderRadius: [3, 3, 0, 0] },
			data: days.map((day) =>
				name === "other" ? others.reduce((sum, tool) => sum + valueOf(day.date, tool), 0) : valueOf(day.date, name),
			),
		})),
	};
}

/** Decode speed (tokens/s) per day, one line per model with the most samples. */
export function buildSpeedOption(days, speed, maxSeries = 4) {
	const weights = new Map();
	for (const day of days) {
		for (const [model, entry] of Object.entries(speed?.[day.date] ?? {})) {
			weights.set(model, (weights.get(model) ?? 0) + Number(entry?.tokens ?? 0));
		}
	}
	const models = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxSeries).map(([model]) => model);
	return {
		backgroundColor: "transparent",
		textStyle: { color: "#9a9a9a", fontSize: 11 },
		tooltip: {
			trigger: "axis",
			textStyle: { fontSize: 11 },
			valueFormatter: (value) => (value == null ? "no data" : `${Math.round(value)} tokens/s`),
		},
		legend: { top: 0, textStyle: { color: "#9a9a9a", fontSize: 11 }, icon: "circle", itemWidth: 8, itemHeight: 8 },
		grid: { left: 48, right: 8, top: 26, bottom: 22 },
		xAxis: {
			type: "category",
			data: days.map((day) => day.date.slice(5)),
			axisLine: { lineStyle: { color: "#333" } },
			axisLabel: { color: "#9a9a9a", fontSize: 10 },
		},
		yAxis: {
			type: "value",
			splitLine: { lineStyle: { color: "#262626" } },
			axisLabel: { color: "#9a9a9a", fontSize: 10, formatter: (value) => `${value}` },
		},
		series: models.map((model, index) => ({
			name: model,
			type: "line",
			smooth: true,
			symbolSize: 5,
			connectNulls: true,
			lineStyle: { width: 2, color: providerColor(index) },
			itemStyle: { color: providerColor(index) },
			data: days.map((day) => {
				const entry = speed?.[day.date]?.[model];
				if (!entry || Number(entry.ms) <= 0) return null;
				return Math.round((Number(entry.tokens) / Number(entry.ms)) * 1000);
			}),
		})),
	};
}

/**
 * Heatmap values in ZCode's three modes: each day's own total, its ISO week's
 * total (uniform blocks), or the running total up to that day.
 */
export function heatmapValues(days, enabled, mode) {
	const totals = dayTotals(days, enabled);
	if (mode === "cumulative") {
		let running = 0;
		return totals.map((day) => {
			running += day.total;
			return [day.date, running];
		});
	}
	if (mode === "weekly") {
		const weekOf = (date) => {
			const time = Date.parse(date);
			const weekday = (new Date(time).getUTCDay() + 6) % 7; // Monday = 0
			return new Date(time - weekday * 86400000).toISOString().slice(0, 10);
		};
		const weekTotals = new Map();
		for (const day of totals) weekTotals.set(weekOf(day.date), (weekTotals.get(weekOf(day.date)) ?? 0) + day.total);
		return totals.map((day) => [day.date, weekTotals.get(weekOf(day.date)) ?? 0]);
	}
	return totals.map((day) => [day.date, day.total]);
}
