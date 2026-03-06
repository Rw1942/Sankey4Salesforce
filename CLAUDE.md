# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sankey4Salesforce is a Salesforce managed package providing a Lightning Web Component (LWC) that renders interactive Sankey (flow) diagrams using D3.js. Users configure visualizations through a point-and-click UI — no coding required. The app supports aggregate flow analysis, individual record tracing, and value-based flow tracing.

## Development Commands

### Prerequisites
- Salesforce CLI: `npm install -g @salesforce/cli`
- Node.js ≥ 18

### Setup
```bash
npm install                          # Install D3 build dependencies
npm run build:d3                     # Builds d3.zip static resource (d3.min.js + d3-sankey.min.js)
sf org login web --alias my-dev-org  # Authenticate to dev org
sf project deploy start --source-dir force-app --target-org my-dev-org
```

### Deploy
```bash
sf project deploy start --source-dir force-app --target-org <alias>
```

### Run Tests
```bash
sf apex run test --target-org <alias> --wait 10
```

### Sample Data
```bash
npm run prep:titanic  # Prepares Titanic_Passenger__c sample data
```

## Architecture

### Apex Layer (`force-app/main/default/classes/`)

Four production classes with a clear separation of concerns:

- **SankeyController.cls** — `@AuraEnabled` entry points called by LWC. Orchestrates query building, data fetching (`WITH SECURITY_ENFORCED`), and aggregation. Key methods: `getSankeyData`, `getRecordCount` (cacheable), `getFieldPopulationStats` (cacheable), `getQueryableObjects` (cacheable).
- **SankeyService.cls** — Path aggregation and KPI computation. Processes raw SObjects into D3-ready nodes/links. Implements three null handling modes: `STOP`, `GROUP_UNKNOWN`, `CARRY_FORWARD`.
- **SankeyQueryBuilder.cls** — Dynamic SOQL builder. All user-supplied values pass through `String.escapeSingleQuotes()`. Main query has `LIMIT 10000` governor guard.
- **SankeyConfigRepository.cls** — CRUD for `DS_Sankey_Config__c`. Owner-scoped (no View All / Modify All).

### LWC Layer (`force-app/main/default/lwc/`)

Single parent component (`dsSankeyBuilder`) owns all state. Child components communicate via `@api` properties (down) and `CustomEvent` (up).

- **dsSankeyBuilder** — App shell, state manager, exposed to Lightning App Builder. Manages `{config, data, ui}` state. Tracks a config hash to avoid redundant server calls.
- **dsEmptyState** — First-run onboarding; wires `getMyConfigs()` to surface saved configs.
- **dsObjectPicker** — Permission-aware object autocomplete with record counts.
- **dsMetricSelector** — COUNT vs AMOUNT picker; shows numeric field selector for AMOUNT mode.
- **dsPathSelector** — Ordered multi-select for path fields; auto-scores fields by type priority + population % + cardinality.
- **dsFilterBuilder** — SOQL-like filter UI; calls cacheable `getRecordCount` for live preview.
- **dsSankeyChart** — D3 renderer using `lwc:dom="manual"`. Loads D3 via `platformResourceLoader`. All D3 state lives in the DOM; reactive `@api` setters trigger targeted re-renders (not full redraws). Supports aggregate, record trace, and flow trace display modes.
- **dsTracePanel** — Controls for record trace (searchable record list) and flow trace (step + value pickers).
- **dsInsightsPanel** — KPIs and top paths sidebar; content adapts to current trace mode.
- **dsSavedConfigs** — Lists, loads, and deletes saved configurations.
- **dsSaveConfigModal** — `LightningModal` subclass for saving a config with a name.
- **dsUtils** — Pure utility exports (no `LightningElement`): `defaultConfig()`, `defaultData()`, `defaultUi()`, `normalizeLoadedConfig()`, `buildSavePayload()`, field sorting helpers.

### Data Flow

```
LWC (config JSON) → SankeyController → SankeyQueryBuilder → SOQL → SObject[]
                                     → SankeyService → nodes/links/kpis/topPaths JSON
                                     ← returned to dsSankeyChart + dsInsightsPanel
```

### Key JSON Contracts

**Config (LWC → Apex):**
```json
{
  "objectApiName": "string",
  "pathFields": ["field1", "field2"],
  "metricType": "COUNT | AMOUNT",
  "metricField": "string",
  "nullHandling": "STOP | GROUP_UNKNOWN | CARRY_FORWARD",
  "recordIdField": "string",
  "filters": [{ "field": "f", "operator": "=", "value": "v", "isDateLiteral": false }]
}
```

**Response (Apex → LWC):** `{ nodes, links, records, stepColumns, kpis, topPaths }`
Node IDs use the format `"stepIndex::value"`. Link keys use `"source→target"`.

### Custom Object

`DS_Sankey_Config__c` stores saved configurations. Key fields: `Object_Api_Name__c`, `Path_Fields_JSON__c`, `Filters_JSON__c`, `Metric_Type__c`, `Metric_Field__c`, `Null_Handling__c`, `Record_Id_Field__c`. Owner-based sharing (ReadWrite), no View All.

### Security Model

All SOQL uses `WITH SECURITY_ENFORCED`. Dynamic values go through `String.escapeSingleQuotes()`. `getQueryableObjects()` filters by `isQueryable`, `isAccessible`, and `isCreateable || isUpdateable`. Repository operations verify record ownership before delete.

## Important Implementation Notes

- **D3 DOM access**: `dsSankeyChart` uses `lwc:dom="manual"` — never manipulate its internal DOM from outside the component.
- **Static resource**: `d3.zip` must contain `d3.min.js` and `d3-sankey.min.js` at the zip root (not in a subfolder). Rebuild with `npm run build:d3` after updating D3 versions.
- **Caching**: `@AuraEnabled(cacheable=true)` methods cannot perform DML. The repository `getMyConfigs()` is cacheable; `saveConfig` and `deleteConfig` are not.
- **Field scoring**: `dsPathSelector` auto-ranks fields by: picklist (highest) > text/string > numeric > other, weighted with population % and cardinality from `getFieldPopulationStats`.
- **Governor limits**: Main data query is capped at 10,000 rows. `getObjectRecordCounts` caps at 30 objects.
- **API version**: 62.0 (Spring '24). Defined in `sfdx-project.json`.
