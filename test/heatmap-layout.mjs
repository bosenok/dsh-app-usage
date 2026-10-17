// Layout probe: builds the real heatmap option in ECharts (happy-dom + canvas
// stub) and inspects the calendar coordinate system. It fails if the grid is
// stretched (rectangular cells) or does not span about a year — the two
// regressions that made the panel look unlike a classic activity heatmap.
import { Window } from "happy-dom";
import { buildHeatmapOption, heatmapValues } from "../src/options.js";

const window = new Window({ url: "http://localhost/" });
for (const key of ["document", "HTMLElement", "Element", "Node", "Text", "SVGElement", "SVGGraphicsElement", "Image", "navigator", "getComputedStyle", "ResizeObserver", "MutationObserver", "CSSStyleSheet", "customElements"]) {
	if (window[key] !== undefined && globalThis[key] === undefined) globalThis[key] = window[key];
}
globalThis.window = window;
globalThis.self = window;
globalThis.requestAnimationFrame ??= (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);

const fakeContext = new Proxy(
	{},
	{
		get: (target, prop) => {
			if (prop === "canvas") return { width: 1200, height: 200, style: {} };
			if (prop === "measureText") return () => ({ width: 10 });
			if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop() {} });
			if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
			if (typeof prop === "string" && /^(fill|stroke|clear|save|restore|begin|close|move|line|rect|arc|bezier|quadratic|translate|rotate|scale|set|draw|put|clip|transform|ellipse|roundRect|isPoint)/.test(prop)) return () => {};
			return undefined;
		},
		set: () => true,
	},
);
window.HTMLCanvasElement.prototype.getContext = () => fakeContext;

const { use, init } = await import("echarts/core");
const { CanvasRenderer } = await import("echarts/renderers");
const { HeatmapChart } = await import("echarts/charts");
const { CalendarComponent, TooltipComponent, VisualMapComponent } = await import("echarts/components");
use([CanvasRenderer, HeatmapChart, CalendarComponent, TooltipComponent, VisualMapComponent]);

const days = [
	{ date: "2026-10-05", providers: { zai: { "glm-5.3": { total: 1000000 } } } },
	{ date: "2026-10-06", providers: { zai: { "glm-5.3": { total: 2000000 } } } },
	{ date: "2026-10-07", providers: { zai: { "glm-5.3": { total: 3000000 } } } },
];
const enabled = new Set(["zai"]);

let failed = false;
for (const cellSize of [10, 14, 20]) {
	const option = buildHeatmapOption(days, enabled, heatmapValues(days, enabled, "daily"), cellSize);
	const el = window.document.createElement("div");
	window.document.body.appendChild(el);
	const chart = init(el, null, { width: 1400, height: 220, renderer: "canvas" });
	chart.setOption(option);
	const cs = chart.getModel().getComponent("calendar").coordinateSystem;
	const rect = cs.getRect();
	const info = cs.getRangeInfo?.();
	const weeks = info ? Math.round((info.end.time - info.start.time) / (7 * 86400000)) : 0;
	const cellW = weeks > 0 ? rect.width / weeks : 0;
	const cellH = rect.height / 7;
	const square = Math.abs(cellW - cellH) < 1.5;
	const fills = Math.abs(cellW - cellSize) < 1.5;
	console.log(`cellSize=${cellSize}: rect=${Math.round(rect.width)}x${Math.round(rect.height)} weeks=${weeks} cell=${cellW.toFixed(1)}x${cellH.toFixed(1)} ${square ? "SQUARE" : "RECT"} ${fills ? "sized-as-asked" : `expected ${cellSize}`}`);
	if (!square) {
		console.log(`[FAIL] cells are not square at cellSize=${cellSize}`);
		failed = true;
	}
	if (!fills) {
		console.log(`[FAIL] the grid does not honour the requested cell size`);
		failed = true;
	}
	if (weeks < 50) {
		console.log(`[FAIL] range covers only ${weeks} weeks, expected about 53`);
		failed = true;
	}
	chart.dispose();
}

console.log(failed ? "HEATMAP LAYOUT FAILED" : "HEATMAP LAYOUT OK");
process.exit(failed ? 1 : 0);
