# Sankey4Salesforce

A Salesforce Lightning Web Component (LWC) that renders interactive Sankey diagrams using D3.js to visualise process flows and record traces within the Salesforce platform.


## What It Does

- Point-and-click configuration: pick any queryable Salesforce object and its fields to build a Sankey diagram with no code
- Smart field suggestions: scores fields by data type, population, and cardinality, then auto-selects the top 5
- Aggregated Sankey view with count or amount metrics
- Record Trace mode to highlight an individual record's path through the flow
- Flow Trace mode to explore all records passing through a specific node
- KPI insights panel with top paths and conversion metrics
- Save and load named configurations for quick reuse
- Custom SLDS-compliant autocomplete for object selection with type-ahead filtering
- **Appears in the App Launcher automatically after install** — no manual page setup required
- **Titanic passenger demo data seeded on fresh install** for immediate exploration

## Installing via Package

The quickest way to get started is to install the managed package directly into your org:

```
https://login.salesforce.com/packaging/installPackage.apexp?p0=04tfj000000FrATAA0
```
<img width="1980" height="1414" alt="image" src="https://github.com/user-attachments/assets/c8fc0cca-769d-45d9-b0ae-eb10481e6275" />

<br>

<img width="3284" height="1862" alt="image" src="https://github.com/user-attachments/assets/25bba522-40e1-49b2-86b3-46c1d7e9176c" />



Open that URL while logged into your org. The installer will run automatically and the **Sankey Builder** app will appear in the App Launcher (⬡ waffle menu) when complete.

> **Note:** The current published version (1.0.0-1) predates the Titanic demo data and App Launcher setup. A new version with these included is pending. Use the source deploy path below if you want everything.

## Project Structure

```
force-app/main/default/
├── applications/
│   └── Sankey_Builder.app-meta.xml   # App Launcher entry
├── flexipages/
│   └── Sankey_Builder.flexipage-meta.xml  # App page hosting the LWC
├── tabs/
│   └── Sankey_Builder.tab-meta.xml   # Tab pointing to the FlexiPage
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
│   └── dsUtils/              # Shared pure utility functions
├── classes/
│   ├── SankeyController.cls          # @AuraEnabled entry points
│   ├── SankeyService.cls             # Path aggregation + KPI computation
│   ├── SankeyQueryBuilder.cls        # Dynamic SOQL builder
│   ├── SankeyConfigRepository.cls    # CRUD for DS_Sankey_Config__c
│   ├── TitanicInstallHandler.cls     # Post-install script: seeds demo data
│   ├── SankeyControllerTest.cls
│   ├── SankeyServiceTest.cls
│   └── TitanicInstallHandlerTest.cls
├── objects/
│   ├── DS_Sankey_Config__c/          # Saved configuration storage
│   └── Titanic_Passenger__c/         # Demo data object
└── staticresources/
    ├── d3.zip                        # D3 v7 + d3-sankey (minified)
    └── TitanicData.csv               # 1,309-row Titanic dataset (seeded on install)
```

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Salesforce CLI (`sf`) | latest | `npm install -g @salesforce/cli` |
| Node.js | ≥18 | [nodejs.org](https://nodejs.org) |
| VS Code + Salesforce Extension Pack | latest | VS Code Marketplace |

## Setup (Source Deploy)

### 1. Install dependencies and build D3

```bash
npm install
npm run build:d3
```

This bundles `d3.min.js` + `d3-sankey.min.js` into `force-app/main/default/staticresources/d3.zip`.

### 2. Authenticate to your org

```bash
sf org login web --alias my-dev-org
```

### 3. Deploy

```bash
sf project deploy start --source-dir force-app --target-org my-dev-org
```

The **Sankey Builder** app will appear in the App Launcher immediately after deploy. The Admin profile is granted visibility automatically.

### 4. Load demo data (optional)

To seed the Titanic passenger dataset manually (this runs automatically on package install):

```bash
sf apex run --target-org my-dev-org --file /dev/stdin <<'EOF'
Test.testInstall(new TitanicInstallHandler(), null, false);
EOF
```

Or import from the pre-built CSV:

```bash
sf data import tree --files data/titanic-sf.csv --target-org my-dev-org
```

## Running Tests

```bash
sf apex run test --target-org my-dev-org --wait 10
```

## Development Notes

- D3 is loaded via `lightning/platformResourceLoader` — no CDN (blocked by Salesforce CSP)
- All DOM access uses `this.template.querySelector()` — never `document.querySelector()`
- The `<svg>` element carries `lwc:dom="manual"` so D3 can manage its children
- No Bootstrap or external CSS; SLDS utilities only
- Field option lists are sorted by type priority: picklist fields first, then short text, then numbers, then everything else
- `dsPathSelector` scores fields by data type, population, and cardinality, then auto-selects the top 5; skipped when loading saved configs
- Parent orchestrator (`dsSankeyBuilder`) owns all state; children communicate via `@api` down and `CustomEvent` up

## Windows-Specific Notes

- Run PowerShell or terminal **as Administrator** for global npm installs
- Use `;` instead of `&&` in PowerShell to chain commands
- If `sf` is not found after install, restart your terminal or add `%APPDATA%\npm` to your PATH

## Source Control

Remote: https://github.com/Rw1942/Sankey4Salesforce
