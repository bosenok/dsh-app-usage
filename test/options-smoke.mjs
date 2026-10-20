// Option-builder smoke test for the provider-aware App Usage charts: runs the
// pure builders against a realistic multi-provider payload plus degenerate ones.
import { buildDailyOption, buildDonutOption, buildHeatmapOption, dayList, providerNames, providerTotals, modelTotals } from "../src/options.js";

const days = {
	"2026-10-05": { zai: { "glm-5.3": { input: 10, output: 20, total: 30 } } },
	"2026-10-06": {
		zai: { "glm-5.3": { input: 1, output: 2, total: 3 }, "glm-5.3-flash": { input: 4, output: 4, total: 8 } },
		openrouter: { "anthropic/claude-sonnet-5": { input: 100, output: 200, total: 300 } },
	},
	"2026-10-07": {
		zai: { "glm-5.3": { total: 5 } },
		"deepseek-official": { "deepseek-flash": { total: 7 } },
	},
};

const cases = [
	["real multi-provider", days],
	["empty object", {}],
	["undefined", undefined],
	["day without providers", { "2026-10-01": {} }],
	["provider without models", { "2026-10-01": { zai: {} } }],
	["model without totals", { "2026-10-01": { zai: { m: {} } } }],
];

let failed = false;
for (const [label, input] of cases) {
	const list = dayList(input, 30);
	const names = providerNames(list);
	const enabled = new Set(names);
	const rows = providerTotals(list, enabled);
	try {
		buildDailyOption(list, enabled, () => "#fff");
		buildDonutOption(rows.map((row) => ({ name: row.provider, value: row.total })), () => "#fff");
		buildDonutOption(modelTotals(list, enabled), () => "#fff");
		buildHeatmapOption(list, enabled);
		console.log(`[ok] ${label}: providers=${names.length} rows=${rows.length}`);
	} catch (error) {
		failed = true;
		console.log(`[FAIL] ${label}: ${String(error?.stack ?? error).slice(0, 240)}`);
	}
}

// Selection semantics must actually restrict the numbers.
const list = dayList(days, 30);
const all = providerTotals(list, new Set(providerNames(list)));
const onlyZai = providerTotals(list, new Set(["zai"]));
const expectedAll = 30 + 3 + 8 + 300 + 5 + 7;
const expectedZai = 30 + 3 + 8 + 5;
console.log(`totals: all=${all.reduce((sum, row) => sum + row.total, 0)} (expect ${expectedAll}), zai=${onlyZai.reduce((sum, row) => sum + row.total, 0)} (expect ${expectedZai})`);
if (all.reduce((sum, row) => sum + row.total, 0) !== expectedAll) failed = true;
if (onlyZai.reduce((sum, row) => sum + row.total, 0) !== expectedZai) failed = true;
if (onlyZai.length !== 1 || onlyZai[0].provider !== "zai") failed = true;

// Cache reads are not work: they must not inflate the counted totals, and the
// provider-reported sum (input + output + cache) must stay visible beside them.
const cached = providerTotals(
	dayList({ "2026-10-08": { openrouter: { m: { input: 10, output: 5, cache: 1000, total: 1015 } } } }, 30),
	new Set(["openrouter"]),
);
if (cached[0]?.total !== 15) {
	console.log(`[FAIL] counted tokens = ${cached[0]?.total}, expected 15`);
	failed = true;
}
if (cached[0]?.cache !== 1000) {
	console.log(`[FAIL] cache reads = ${cached[0]?.cache}, expected 1000`);
	failed = true;
}
if (cached[0]?.reported !== 1015) {
	console.log(`[FAIL] reported total = ${cached[0]?.reported}, expected 1015`);
	failed = true;
}
console.log(`cache semantics: counted=${cached[0]?.total} cache=${cached[0]?.cache} reported=${cached[0]?.reported}`);

console.log(failed ? "OPTIONS TEST FAILED" : "OPTIONS TEST OK");
process.exit(failed ? 1 : 0);
