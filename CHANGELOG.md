# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-29

### Added

- The usage dashboard: KPIs, daily stacked bars by provider, a provider/model
  donut, the activity heatmap, the token table and decode speed.
- A per-model breakdown with sorting (tokens, cache, days), the tail behind
  "+N more", and click-to-drill-down that narrows the charts to one model.
- The donut can switch between the provider split and the model split.

### Changed

- Tokens are counted as input + output; prompt-cache reads are stored and shown
  separately, with the provider-reported total kept beside them.
- The heatmap starts on Monday and the panel is sized so all seven weekday rows
  fit.

### Fixed

- The heatmap no longer crops its last weekday row, and the model-row count in
  the smoke test is correct.
