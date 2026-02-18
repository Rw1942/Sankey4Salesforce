# Sankey4Salesforce

A Salesforce Lightning Web Component (LWC) that renders interactive Sankey diagrams using D3.js to visualise process flows and record traces within the Salesforce platform.

## What It Does

- Displays an aggregated Sankey diagram of process-flow data
- Lets users select a record from a dropdown to highlight its individual path through the flow
- Supports animated step-by-step trace of a selected record's journey and value

## Project Structure

```
force-app/main/default/
├── lwc/
│   └── sankeyExplorer/          ← Main LWC component
│       ├── sankeyExplorer.html
│       ├── sankeyExplorer.js
│       ├── sankeyExplorer.css
│       └── sankeyExplorer.js-meta.xml
├── classes/
│   └── SankeyDataController.cls ← Apex class returning flow data as JSON
└── staticresources/
    ├── d3.resource-meta.xml     ← Metadata for D3 static resource
    └── d3.zip                   ← D3 bundle (add locally, gitignored as binary)
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

In Setup → App Builder, drag the **sankeyExplorer** component onto any App Page or Record Page.

## Development Notes

- D3 is loaded via `lightning/platformResourceLoader` — no CDN (blocked by Salesforce CSP)
- All DOM access uses `this.template.querySelector()` — never `document.querySelector()`
- The `<svg>` element carries `lwc:dom="manual"` so D3 can manage its children
- No Bootstrap or external CSS; SLDS utilities only

## Windows-Specific Notes

- Run PowerShell or terminal **as Administrator** for global npm installs
- Use `;` instead of `&&` in PowerShell to chain commands
- If `sf` is not found after install, restart your terminal or add `%APPDATA%\npm` to your PATH

## Source Control

Remote: https://github.com/Rw1942/Sankey4Salesforce
