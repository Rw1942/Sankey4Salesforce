# Sankey4Salesforce

A Salesforce Lightning Web Component (LWC) that renders interactive Sankey diagrams using D3.js to visualise process flows and record traces within the Salesforce platform.

## What It Does

- Point-and-click configuration: pick any queryable Salesforce object and its fields to build a Sankey diagram with no code
- Smart field suggestions: auto-selects the best picklist fields based on type priority (picklists first, then short text, then numbers)
- Aggregated Sankey view with count or amount metrics
- Record Trace mode to highlight an individual record's path through the flow
- Flow Trace mode to explore all records passing through a specific node
- KPI insights panel with top paths and conversion metrics
- Save and load named configurations for quick reuse
- Custom SLDS-compliant autocomplete for object selection with type-ahead filtering

## Project Structure

```
force-app/main/default/
├── lwc/
│   ├── dsSankeyBuilder/      # Parent orchestrator (exposed)
│   ├── dsEmptyState/         # First-time onboarding
│   ├── dsObjectPicker/       # Permission-aware object autocomplete
│   ├── dsMetricSelector/     # Count vs Amount metric picker
│   ├── dsPathSelector/       # Ordered path field selector with auto-selection
│   ├── dsFilterBuilder/      # SOQL filter builder UI
│   ├── dsSankeyChart/        # D3 Sankey rendering (lwc:dom="manual")
│   ├── dsTracePanel/         # Record Trace + Flow Trace controls
│   ├── dsInsightsPanel/      # KPIs and top paths sidebar
│   ├── dsSavedConfigs/       # Save/load config via Apex
│   ├── dsSaveConfigModal/    # LightningModal for save dialog
│   └── sankeyExplorer/       # Standalone demo (isExposed=false)
├── classes/
│   ├── SankeyController.cls          # @AuraEnabled entry points
│   ├── SankeyService.cls             # Path aggregation + KPI computation
│   ├── SankeyQueryBuilder.cls        # Dynamic SOQL builder
│   ├── SankeyConfigRepository.cls    # CRUD for DS_Sankey_Config__c
│   ├── SankeyControllerTest.cls
│   └── SankeyServiceTest.cls
├── objects/
│   └── DS_Sankey_Config__c/          # Saved configuration storage
└── staticresources/
    └── d3.zip                        # D3 v7 + d3-sankey (minified)
```

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Salesforce CLI (`sf`) | latest | `npm install -g @salesforce/cli` |
| Node.js | ≥18 | [nodejs.org](https://nodejs.org) |
| VS Code + Salesforce Extension Pack | latest | VS Code Marketplace |

## Setup

### 1. Install Salesforce CLI

Open a terminal **as Administrator** and run:

```powershell
npm install -g @salesforce/cli
sf --version
```

### 2. Authenticate to your Salesforce org

```powershell
sf org login web --alias my-dev-org
```

This opens a browser for OAuth login. Use a Developer Edition or Sandbox org.

### 3. Add the D3 Static Resource

Download the D3 v7 minified bundle and package it:

1. Download `d3.min.js` from [d3js.org](https://d3js.org) or `npm pack d3`
2. Create a zip file: place `d3.min.js` at the **root** of the zip (not in a subfolder)
3. Name the zip `d3.zip` and place it at `force-app/main/default/staticresources/d3.zip`

### 4. Deploy to org

```powershell
sf project deploy start --source-dir force-app --target-org my-dev-org
```

### 5. Add to a page

In Setup → App Builder, drag the **Sankey Builder** (`dsSankeyBuilder`) component onto any App Page, Record Page, or Home Page.

## Development Notes

- D3 is loaded via `lightning/platformResourceLoader` — no CDN (blocked by Salesforce CSP)
- All DOM access uses `this.template.querySelector()` — never `document.querySelector()`
- The `<svg>` element carries `lwc:dom="manual"` so D3 can manage its children
- No Bootstrap or external CSS; SLDS utilities only
- Field option lists are sorted by type priority: picklist fields first, then short text, then numbers, then everything else
- `dsPathSelector` auto-selects up to 8 picklist fields on fresh object selection; skipped when loading saved configs
- Parent orchestrator (`dsSankeyBuilder`) owns all state; children communicate via `@api` down and `CustomEvent` up

## Windows-Specific Notes

- Run PowerShell or terminal **as Administrator** for global npm installs
- Use `;` instead of `&&` in PowerShell to chain commands
- If `sf` is not found after install, restart your terminal or add `%APPDATA%\npm` to your PATH

## Source Control

Remote: https://github.com/Rw1942/Sankey4Salesforce
