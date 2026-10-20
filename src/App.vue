<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import { CalendarComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import VChart from "vue-echarts";
import {
	activityKpis,
	buildDailyOption,
	buildDonutOption,
	buildHeatmapOption,
	buildSpeedOption,
	buildToolsOption,
	dayList,
	fmt,
	fmtDuration,
	heatmapPanelHeight,
	heatmapValues,
	modelTotals,
	providerColor,
	providerNames,
	providerTotals,
} from "./options.js";

use([
	CanvasRenderer,
	BarChart,
	PieChart,
	HeatmapChart,
	LineChart,
	GridComponent,
	LegendComponent,
	TooltipComponent,
	VisualMapComponent,
	CalendarComponent,
]);

const state = inject("usageState");
/** Providers the user switched off. Empty = everything shown. */
const disabled = ref(new Set());
const trendTab = ref("models");
const heatmapMode = ref("daily");

const allDays = computed(() => dayList(state.data?.days, 100000));
const last30 = computed(() => dayList(state.data?.days, 30));
const heatmapDays = computed(() => dayList(state.data?.days, 182));
const allProviders = computed(() => [...new Set([...(state.data?.providers ?? []), ...providerNames(allDays.value)])]);
const enabled = computed(() => new Set(allProviders.value.filter((provider) => disabled.value.has(provider) === false)));

const colorIndex = computed(() => new Map(allProviders.value.map((provider, index) => [provider, index])));
function colorOf(provider) {
	return providerColor(colorIndex.value.get(provider) ?? 0);
}

const rows = computed(() => providerTotals(last30.value, enabled.value));
const grandTotal = computed(() => rows.value.reduce((sum, row) => sum + row.total, 0));
const kpis = computed(() => activityKpis(allDays.value, enabled.value, state.data?.activity));

const dailyOption = computed(() => buildDailyOption(last30.value, enabled.value, colorOf));
const toolsOption = computed(() => buildToolsOption(last30.value, state.data?.tools, 6));
const speedOption = computed(() => buildSpeedOption(last30.value, state.data?.speed));
const hasSpeed = computed(() => (state.data?.speed != null) && Object.keys(state.data.speed).length > 0);

const heatmapOption = computed(() => {
	const values = heatmapValues(heatmapDays.value, enabled.value, heatmapMode.value);
	return buildHeatmapOption(heatmapDays.value, enabled.value, values, heatmapCellSize.value);
});

// The calendar keeps SQUARE cells; its edge is derived from the measured panel
// width so the year grid fills the card instead of leaving a wide empty strip.
const heatmapHost = ref(null);
const heatmapWidth = ref(0);
let resizeObserver = null;
onMounted(() => {
	const host = heatmapHost.value?.$el ?? heatmapHost.value;
	if (typeof ResizeObserver === "undefined" || host == null) return;
	resizeObserver = new ResizeObserver((entries) => {
		heatmapWidth.value = entries[0]?.contentRect?.width ?? 0;
	});
	resizeObserver.observe(host);
});
onBeforeUnmount(() => {
	resizeObserver?.disconnect();
	resizeObserver = null;
});
const heatmapCellSize = computed(() => {
	if (heatmapWidth.value <= 0) return 14;
	const weeks = 53;
	return Math.max(9, Math.min(22, Math.floor((heatmapWidth.value - 44) / weeks)));
});

// The calendar draws seven rows; the panel is sized to hold them all.
const heatmapHeight = computed(() => heatmapPanelHeight(heatmapCellSize.value));

const donutOption = computed(() => {
	if (rows.value.length === 1) {
		const only = rows.value[0];
		return buildDonutOption(
			only.models.map((entry) => ({ name: entry.model, value: entry.total })),
			(_name, index) => providerColor(index),
		);
	}
	return buildDonutOption(
		rows.value.map((row) => ({ name: row.provider, value: row.total })),
		(name) => colorOf(name),
	);
});
const donutTitle = computed(() => (rows.value.length === 1 ? `Models · ${rows.value[0].provider}` : "Providers · 30 days"));

const updatedAt = computed(() => (state.at ? new Date(state.at).toLocaleTimeString() : ""));

function toggle(provider) {
	const next = new Set(disabled.value);
	if (next.has(provider)) next.delete(provider);
	else next.add(provider);
	disabled.value = next;
}
function enableAll() {
	disabled.value = new Set();
}
function disableAll() {
	disabled.value = new Set(allProviders.value);
}
function refresh() {
	state.refresh?.();
}
function share(total) {
	return grandTotal.value > 0 ? Math.round((total / grandTotal.value) * 100) : 0;
}
</script>

<template>
	<div class="usage-root">
		<div class="usage-header">
			<div class="usage-title">
				App Usage
				<span class="usage-badge">local sessions</span>
			</div>
			<div class="usage-meta">
				<span v-if="updatedAt">updated {{ updatedAt }}</span>
				<button class="usage-refresh" :disabled="state.status === 'loading'" @click="refresh">Refresh</button>
			</div>
		</div>

		<div v-if="state.status === 'error'" class="usage-error">{{ state.error }}</div>

		<template v-else>
			<div class="usage-providers">
				<span class="usage-providers-label">Providers</span>
				<button
					v-for="provider in allProviders"
					:key="provider"
					class="usage-chip"
					:class="{ off: disabled.has(provider) }"
					:style="{ borderColor: colorOf(provider) }"
					@click="toggle(provider)"
				>
					<span class="usage-dot" :style="{ background: colorOf(provider) }" />
					{{ provider }}
				</button>
				<button class="usage-chip ghost" @click="enableAll">all</button>
				<button class="usage-chip ghost" @click="disableAll">none</button>
			</div>

			<div class="usage-kpis">
				<div class="usage-kpi"><span class="usage-kpi-value">{{ fmt(kpis.total) }}</span><span class="usage-kpi-label">total tokens</span></div>
				<div class="usage-kpi"><span class="usage-kpi-value">{{ fmt(kpis.peak) }}</span><span class="usage-kpi-label">peak tokens · {{ kpis.peakDate ?? "-" }}</span></div>
				<div class="usage-kpi"><span class="usage-kpi-value">{{ fmtDuration(kpis.durationMs) }}</span><span class="usage-kpi-label">active time</span></div>
				<div class="usage-kpi"><span class="usage-kpi-value">{{ kpis.current }}d</span><span class="usage-kpi-label">current streak</span></div>
				<div class="usage-kpi"><span class="usage-kpi-value">{{ kpis.longest }}d</span><span class="usage-kpi-label">longest streak</span></div>
				<div class="usage-kpi"><span class="usage-kpi-value">{{ kpis.activeDays }}</span><span class="usage-kpi-label">active days · {{ state.data?.sessions ?? 0 }} sessions</span></div>
			</div>

			<div class="usage-grid">
				<div class="usage-panel">
					<div class="usage-panel-head">
						<span class="usage-panel-title">{{ trendTab === "models" ? "Daily tokens by provider" : "Tool calls by day" }} · last 30 days</span>
						<span class="usage-tabs">
							<button class="usage-tab" :class="{ on: trendTab === 'models' }" @click="trendTab = 'models'">Models</button>
							<button class="usage-tab" :class="{ on: trendTab === 'tools' }" @click="trendTab = 'tools'">Tools</button>
						</span>
					</div>
					<VChart v-if="trendTab === 'models'" class="usage-chart" :option="dailyOption" autoresize />
					<VChart v-else class="usage-chart" :option="toolsOption" autoresize />
				</div>
				<div class="usage-panel">
					<div class="usage-panel-title">{{ donutTitle }}</div>
					<VChart class="usage-chart" :option="donutOption" autoresize />
				</div>
			</div>

			<div class="usage-panel">
				<div class="usage-panel-head">
					<span class="usage-panel-title">Token activity · last 6 months</span>
					<span class="usage-tabs">
						<button class="usage-tab" :class="{ on: heatmapMode === 'daily' }" @click="heatmapMode = 'daily'">Daily</button>
						<button class="usage-tab" :class="{ on: heatmapMode === 'weekly' }" @click="heatmapMode = 'weekly'">Weekly</button>
						<button class="usage-tab" :class="{ on: heatmapMode === 'cumulative' }" @click="heatmapMode = 'cumulative'">Cumulative</button>
					</span>
				</div>
				<VChart ref="heatmapHost" class="usage-chart usage-heatmap" :style="{ height: heatmapHeight + 'px' }" :option="heatmapOption" autoresize />
			</div>

			<div v-if="hasSpeed" class="usage-panel">
				<div class="usage-panel-title">Decode speed · tokens/s · last 30 days</div>
				<VChart class="usage-chart usage-speed" :option="speedOption" autoresize />
			</div>

			<div class="usage-table">
				<div v-for="row in rows" :key="row.provider" class="usage-row">
					<span class="usage-dot" :style="{ background: colorOf(row.provider) }" />
					<span class="usage-row-name">{{ row.provider }}</span>
					<span class="usage-row-total">{{ fmt(row.total) }}</span>
					<span class="usage-row-share">{{ share(row.total) }}%</span>
					<span class="usage-row-models">{{ row.models.slice(0, 3).map((entry) => `${entry.model} ${fmt(entry.total)}`).join(" · ") }}</span>
				</div>
			</div>

			<div class="usage-foot">
				All providers included, nothing filtered · active time counts gaps up to 5 min · decode speed is measured from recorded stream timings
				<template v-if="state.data?.path"> · snapshot: {{ state.data.path }}</template>
			</div>
		</template>
	</div>
</template>

<style>
.usage-root {
	--usage-bg: #1b1b1b;
	--usage-panel: #232323;
	--usage-line: #303030;
	--usage-text: #e8e8e8;
	--usage-dim: #9a9a9a;
	color: var(--usage-text);
	font-family: inherit;
	font-size: 13px;
	padding: 16px 20px 24px;
	min-height: 320px;
	box-sizing: border-box;
	background: var(--usage-bg);
}
.usage-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 12px;
}
.usage-title {
	font-size: 20px;
	font-weight: 700;
	display: flex;
	align-items: center;
	gap: 10px;
}
.usage-badge {
	font-size: 11px;
	font-weight: 600;
	color: var(--usage-dim);
	border: 1px solid var(--usage-line);
	border-radius: 999px;
	padding: 2px 9px;
}
.usage-meta {
	display: flex;
	align-items: center;
	gap: 10px;
	color: var(--usage-dim);
	font-size: 11px;
}
.usage-refresh {
	background: var(--usage-panel);
	color: var(--usage-text);
	border: 1px solid var(--usage-line);
	border-radius: 7px;
	padding: 4px 12px;
	font-size: 12px;
	cursor: pointer;
}
.usage-providers {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	margin-bottom: 12px;
}
.usage-providers-label {
	font-size: 11px;
	color: var(--usage-dim);
	margin-right: 2px;
}
.usage-chip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	background: var(--usage-panel);
	color: var(--usage-text);
	border: 1px solid var(--usage-line);
	border-radius: 999px;
	padding: 3px 10px;
	font-size: 12px;
	cursor: pointer;
}
.usage-chip.off {
	opacity: 0.4;
	text-decoration: line-through;
}
.usage-chip.ghost {
	color: var(--usage-dim);
}
.usage-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	display: inline-block;
	flex: none;
}
.usage-kpis {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: 10px;
	margin-bottom: 12px;
}
.usage-kpi {
	background: var(--usage-panel);
	border-radius: 10px;
	padding: 10px 14px;
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.usage-kpi-value {
	font-size: 18px;
	font-weight: 700;
}
.usage-kpi-label {
	font-size: 11px;
	color: var(--usage-dim);
}
.usage-grid {
	display: grid;
	grid-template-columns: 3fr 2fr;
	gap: 10px;
	margin-bottom: 10px;
}
.usage-panel {
	background: var(--usage-panel);
	border-radius: 10px;
	padding: 12px 14px;
	min-width: 0;
}
.usage-panel + .usage-panel {
	margin-top: 10px;
}
.usage-panel-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	margin-bottom: 4px;
}
.usage-panel-title {
	font-size: 12px;
	color: var(--usage-dim);
}
.usage-tabs {
	display: inline-flex;
	gap: 4px;
}
.usage-tab {
	background: transparent;
	color: var(--usage-dim);
	border: 1px solid var(--usage-line);
	border-radius: 999px;
	padding: 2px 10px;
	font-size: 11px;
	cursor: pointer;
}
.usage-tab.on {
	background: #2f2f2f;
	color: var(--usage-text);
}
.usage-chart {
	height: 240px;
	width: 100%;
}
.usage-heatmap {
	/* The height is bound from the measured cell size (heatmapPanelHeight);
	   this is only the fallback before the first measurement. */
	height: 152px;
	min-height: 152px;
}
.usage-speed {
	height: 180px;
}
.usage-table {
	margin-top: 10px;
	background: var(--usage-panel);
	border-radius: 10px;
	padding: 6px 14px;
}
.usage-row {
	display: grid;
	grid-template-columns: 16px 160px 90px 50px 1fr;
	align-items: center;
	gap: 8px;
	padding: 7px 0;
	border-bottom: 1px solid #2a2a2a;
	font-size: 12px;
}
.usage-row:last-child {
	border-bottom: none;
}
.usage-row-name {
	font-weight: 600;
}
.usage-row-share {
	color: var(--usage-dim);
}
.usage-row-models {
	color: #6d6d6d;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.usage-error {
	background: #2a1d1d;
	border: 1px solid #4a2a2a;
	color: #f0a0a0;
	border-radius: 8px;
	padding: 8px 12px;
	font-size: 12px;
}
.usage-foot {
	margin-top: 10px;
	font-size: 11px;
	color: #6d6d6d;
}
@media (max-width: 900px) {
	.usage-grid {
		grid-template-columns: 1fr;
	}
	.usage-row {
		grid-template-columns: 16px 1fr 80px;
	}
	.usage-row-share,
	.usage-row-models {
		display: none;
	}
}
</style>
