//#region src/options.js
var e = [
	"#4f8ef7",
	"#34d399",
	"#8b5cf6",
	"#f59e0b",
	"#f472b6",
	"#22d3ee",
	"#a78bfa",
	"#fbbf24"
];
function t(t) {
	return e[t % e.length];
}
function n(e) {
	let t = Number(e ?? 0);
	return t >= 1e9 ? (t / 1e9).toFixed(t >= 1e10 ? 0 : 1) + "B" : t >= 1e6 ? (t / 1e6).toFixed(t >= 1e7 ? 0 : 1) + "M" : t >= 1e3 ? (t / 1e3).toFixed(0) + "K" : String(t);
}
function r(e, t) {
	return Object.entries(e ?? {}).map(([e, t]) => ({
		date: e,
		providers: t
	})).slice(-t);
}
function i(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e) for (let e of Object.keys(n.providers ?? {})) t.add(e);
	return [...t].sort((e, t) => e.localeCompare(t));
}
function a(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) for (let [e, i] of Object.entries(r.providers ?? {})) {
		if (t != null && t.has(e) === !1) continue;
		let r = n.get(e) ?? {
			provider: e,
			total: 0,
			models: /* @__PURE__ */ new Map()
		};
		for (let [e, t] of Object.entries(i ?? {})) {
			let n = Number(t?.total ?? 0);
			r.total += n, r.models.set(e, (r.models.get(e) ?? 0) + n);
		}
		n.set(e, r);
	}
	return [...n.values()].map((e) => ({
		provider: e.provider,
		total: e.total,
		models: [...e.models.entries()].map(([e, t]) => ({
			model: e,
			total: t
		})).sort((e, t) => t.total - e.total)
	})).filter((e) => e.total > 0).sort((e, t) => t.total - e.total);
}
function o(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) for (let [e, i] of Object.entries(r.providers ?? {})) if (t == null || t.has(e) !== !1) for (let [r, a] of Object.entries(i ?? {})) {
		let i = e === [...t ?? [e]][0] ? r : `${e} · ${r}`;
		n.set(i, (n.get(i) ?? 0) + Number(a?.total ?? 0));
	}
	return [...n.entries()].map(([e, t]) => ({
		name: e,
		value: t
	})).filter((e) => e.value > 0).sort((e, t) => t.value - e.value);
}
function s(e, t, r) {
	let a = i(e).filter((e) => t == null || t.has(e));
	return {
		backgroundColor: "transparent",
		textStyle: {
			color: "#9a9a9a",
			fontSize: 11
		},
		tooltip: {
			trigger: "axis",
			textStyle: { fontSize: 11 },
			valueFormatter: (e) => n(e)
		},
		legend: {
			top: 0,
			textStyle: {
				color: "#9a9a9a",
				fontSize: 11
			},
			icon: "circle",
			itemWidth: 8,
			itemHeight: 8
		},
		grid: {
			left: 48,
			right: 8,
			top: 26,
			bottom: 22
		},
		xAxis: {
			type: "category",
			data: e.map((e) => e.date.slice(5)),
			axisLine: { lineStyle: { color: "#333" } },
			axisLabel: {
				color: "#9a9a9a",
				fontSize: 10
			}
		},
		yAxis: {
			type: "value",
			splitLine: { lineStyle: { color: "#262626" } },
			axisLabel: {
				color: "#9a9a9a",
				fontSize: 10,
				formatter: (e) => n(e)
			}
		},
		series: a.map((t) => ({
			name: t,
			type: "bar",
			stack: "tokens",
			barMaxWidth: 18,
			itemStyle: {
				color: r(t),
				borderRadius: [
					3,
					3,
					0,
					0
				]
			},
			data: e.map((e) => {
				let n = 0;
				for (let r of Object.values(e.providers?.[t] ?? {})) n += Number(r?.total ?? 0);
				return n;
			})
		}))
	};
}
function c(e, r) {
	return {
		backgroundColor: "transparent",
		textStyle: {
			color: "#9a9a9a",
			fontSize: 11
		},
		tooltip: {
			trigger: "item",
			textStyle: { fontSize: 11 },
			formatter: (e) => `${e.name}<br/>${n(e.value)} tokens (${e.percent}%)`
		},
		legend: {
			bottom: 0,
			textStyle: {
				color: "#9a9a9a",
				fontSize: 11
			},
			icon: "circle",
			itemWidth: 8,
			itemHeight: 8,
			type: "scroll"
		},
		series: [{
			type: "pie",
			radius: ["52%", "74%"],
			center: ["50%", "42%"],
			label: { show: !1 },
			itemStyle: {
				borderColor: "#1b1b1b",
				borderWidth: 2
			},
			data: e.map((e, n) => ({
				name: e.name,
				value: e.value,
				itemStyle: { color: r == null ? t(n) : r(e.name, n) }
			}))
		}]
	};
}
function l(e, t) {
	let r = e.map((e) => {
		let n = 0;
		for (let [r, i] of Object.entries(e.providers ?? {})) if (t == null || t.has(r) !== !1) for (let e of Object.values(i ?? {})) n += Number(e?.total ?? 0);
		return [e.date, n];
	}), i = e[0]?.date, a = e[e.length - 1]?.date;
	return {
		backgroundColor: "transparent",
		textStyle: {
			color: "#9a9a9a",
			fontSize: 11
		},
		tooltip: {
			formatter: (e) => `${e.value[0]}<br/>${n(e.value[1])} tokens`,
			textStyle: { fontSize: 11 }
		},
		visualMap: {
			show: !1,
			min: 0,
			max: Math.max(1, ...r.map((e) => e[1])),
			inRange: { color: [
				"#1f2937",
				"#2563eb",
				"#93c5fd"
			] }
		},
		...i && a ? { calendar: {
			top: 24,
			left: 36,
			right: 8,
			cellSize: ["auto", 13],
			range: [i, a],
			splitLine: { show: !1 },
			itemStyle: {
				color: "#232323",
				borderColor: "#1b1b1b",
				borderRadius: 3
			},
			yearLabel: { show: !1 },
			monthLabel: {
				color: "#9a9a9a",
				fontSize: 10
			},
			dayLabel: {
				color: "#666",
				fontSize: 9,
				nameMap: [
					"S",
					"M",
					"T",
					"W",
					"T",
					"F",
					"S"
				]
			}
		} } : {},
		series: [{
			type: "heatmap",
			coordinateSystem: "calendar",
			data: r
		}]
	};
}
//#endregion
//#region test/options-smoke.mjs
var u = {
	"2026-10-05": { zai: { "glm-5.3": {
		input: 10,
		output: 20,
		total: 30
	} } },
	"2026-10-06": {
		zai: {
			"glm-5.3": {
				input: 1,
				output: 2,
				total: 3
			},
			"glm-5.3-flash": {
				input: 4,
				output: 4,
				total: 8
			}
		},
		openrouter: { "anthropic/claude-sonnet-5": {
			input: 100,
			output: 200,
			total: 300
		} }
	},
	"2026-10-07": {
		zai: { "glm-5.3": { total: 5 } },
		"deepseek-official": { "deepseek-flash": { total: 7 } }
	}
}, d = [
	["real multi-provider", u],
	["empty object", {}],
	["undefined", void 0],
	["day without providers", { "2026-10-01": {} }],
	["provider without models", { "2026-10-01": { zai: {} } }],
	["model without totals", { "2026-10-01": { zai: { m: {} } } }]
], f = !1;
for (let [e, t] of d) {
	let n = r(t, 30), u = i(n), d = new Set(u), p = a(n, d);
	try {
		s(n, d, () => "#fff"), c(p.map((e) => ({
			name: e.provider,
			value: e.total
		})), () => "#fff"), c(o(n, d), () => "#fff"), l(n, d), console.log(`[ok] ${e}: providers=${u.length} rows=${p.length}`);
	} catch (t) {
		f = !0, console.log(`[FAIL] ${e}: ${String(t?.stack ?? t).slice(0, 240)}`);
	}
}
var p = r(u, 30), m = a(p, new Set(i(p))), h = a(p, /* @__PURE__ */ new Set(["zai"])), g = 353, _ = 46;
console.log(`totals: all=${m.reduce((e, t) => e + t.total, 0)} (expect ${g}), zai=${h.reduce((e, t) => e + t.total, 0)} (expect ${_})`), m.reduce((e, t) => e + t.total, 0) !== g && (f = !0), h.reduce((e, t) => e + t.total, 0) !== _ && (f = !0), (h.length !== 1 || h[0].provider !== "zai") && (f = !0), console.log(f ? "OPTIONS TEST FAILED" : "OPTIONS TEST OK"), process.exit(+!!f);
//#endregion
