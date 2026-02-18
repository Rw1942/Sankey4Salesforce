EPIC 1 — Discover & Launch the Sankey Builder
Story 1.1 — Access the Sankey Builder

As a Salesforce user
I want to open the Sankey Builder from an App Page / Record Page
So that I can analyze process flow without leaving Salesforce

Acceptance

Component is available in Lightning App Builder

Admin can place it on:

App page

Record page

Home page

Loads with empty state and guided onboarding

Story 1.2 — First-time empty state

As a first-time user
I want a clear explanation of what the Sankey does
So that I understand how to begin

Acceptance

Shows “Select a data source to begin”

Displays example use cases:

Opportunity stage flow

Case lifecycle

Loan pipeline

“Start” CTA

EPIC 2 — Select the Data Source
Story 2.1 — Choose Salesforce object

As a user
I want to select a standard or custom object
So that I can build a Sankey from its records

Acceptance

Object picker (permission-aware)

Searchable

Shows label + API name

Story 2.2 — Define the dataset

As a user
I want to filter which records are included
So that the Sankey represents a meaningful cohort

Acceptance

Filter builder:

Field

Operator

Value

Date range quick filters

“Preview record count”

Query runs only after user clicks “Load Data” (lazy load for performance)

Story 2.3 — Select metric

As a user
I want to choose Count or Amount
So that link width reflects the right measure

Acceptance

If Amount:

numeric field picker

Default = Count

EPIC 3 — Define the Sankey Structure
Story 3.1 — Select the path fields

As a user
I want to pick ordered stage fields
So that the Sankey represents a lifecycle

Acceptance

Multi-select ordered list

Drag to reorder

Only picklist / lookup / text fields allowed

Minimum 2 steps

Story 3.2 — Handle missing values

As a user
I want to choose how nulls are treated
So that the flow is accurate

Options

Stop path

Group as “Unknown”

Carry forward last value

Story 3.3 — Record identifier selection

As a user
I want to define the unique record ID
So that I can trace individual records

Default: Id

EPIC 4 — Generate the Sankey
Story 4.1 — Run the query

As a user
I want the Sankey to generate after configuration
So that I see the flow

Acceptance

Spinner while loading

Uses cached wire result when inputs unchanged

Error state if no data

Story 4.2 — View aggregated Sankey

As a user
I want to see the high-level flow first
So that I understand the big picture

Acceptance

Node columns left → right

Link width based on selected metric

Tooltips:

value

record count

% of total

EPIC 5 — Trace Individual Records
Story 5.1 — Record trace mode

As a user
I want a record dropdown
So that I can follow one record across the lifecycle

Acceptance

Searchable combobox

Selecting a record:

highlights its path

dims others

Tooltip shows record link to Salesforce

Story 5.2 — Open record from Sankey

As a user
I want to click a highlighted path and open the record
So that I can investigate the details

EPIC 6 — Flow Trace Mode
Story 6.1 — Select a step to trace

As a user
I want to choose a stage column
So that I can analyze a specific transition point

Story 6.2 — Select a value within the step

As a user
I want to pick a node value
So that I can see where those records came from and went

Acceptance

Sankey highlights:

upstream

downstream

KPI summary:

total records

total amount

conversion %

EPIC 7 — Guided Insights
Story 7.1 — Show contextual metrics

As a user
I want summary stats for the selected flow
So that I don’t have to calculate them manually

Examples:

Drop-off rate

Conversion rate

Average amount

Story 7.2 — Top paths

As a user
I want to see the most common paths
So that I understand dominant behavior

EPIC 8 — Performance & Progressive Loading
Story 8.1 — Load data only when needed

As a user
I want the component to load quickly
So that it doesn’t slow my page

Acceptance

No query on initial render

Query only after configuration

Large datasets paginated / limited

Story 8.2 — Cache results for interaction

As a user
I want instant interaction after load
So that tracing feels real-time

EPIC 9 — Save & Reuse Configurations
Story 9.1 — Save Sankey definition

As a user
I want to save my configuration
So that I can reuse it later

Saved:

Object

Filters

Steps

Metric

Story 9.2 — Load saved Sankey

As a user
I want to reopen a saved Sankey
So that I don’t rebuild it


Below is a Salesforce-native developer implementation guide for delivering your DS-based Sankey Builder inside Lightning Web Components (LWC) with Apex, UI API, and a scalable aggregation layer.

It is structured so an LWC engineer can build this without inventing architecture.

Developer Guide — DS Sankey Builder for Salesforce LWC
1. Target Architecture
1.1 Runtime model
LWC (UI + State + Interaction)
        ↓
Wire Adapters / Imperative Apex
        ↓
Apex Query + Aggregation Service
        ↓
Salesforce Data (SOQL / UI API)
1.2 Why this pattern

SOQL cannot produce multi-step path aggregation → do it in Apex

LWC handles:

configuration state

rendering

interactions

Apex handles:

permission-aware querying

path computation

metric aggregation

caching

2. Metadata & Packaging
2.1 Make component available in Lightning App Builder

dsSankeyBuilder.js-meta.xml

<targets>
    <target>lightning__AppPage</target>
    <target>lightning__RecordPage</target>
    <target>lightning__HomePage</target>
</targets>
3. Core Data Contracts
3.1 Config DTO (client → Apex)
type SankeyConfig = {
  objectApiName: string
  filters: Filter[]
  pathFields: string[]
  metricType: 'COUNT' | 'AMOUNT'
  metricField?: string
  recordIdField: string
  nullHandling: 'STOP' | 'GROUP_UNKNOWN' | 'CARRY_FORWARD'
}
3.2 Aggregated Response (Apex → LWC)
type SankeyResponse = {
  nodes: SankeyNode[]
  links: SankeyLink[]
  records: TraceableRecord[]
  kpis: SummaryKpis
}
4. EPIC-WISE IMPLEMENTATION
EPIC 1 — Discover & Launch
Empty state

Render-only LWC state:

<template if:true={isEmpty}>
  <c-ds-empty-state
    title="Select a data source to begin"
    examples={examples}>
  </c-ds-empty-state>
</template>

No data calls.

EPIC 2 — Data Source Selection
4.1 Object Picker (permission aware)

Use UI API:

import { getObjectInfos } from 'lightning/uiObjectInfoApi'

Filter:

queryable = true

createable OR updateable OR deletable

4.2 Filter Builder

Client builds a filter JSON → Apex converts to SOQL.

Lazy load:

loadData() {
  this.isLoading = true
  getSankeyData({ config: this.config })
}

Preview record count:

Separate Apex method:

SELECT COUNT()
4.3 Metric selection

Default:

COUNT()

Amount:

Dynamic numeric field picker via getObjectInfo.

EPIC 3 — Define Sankey Structure
5.1 Path field selector

Only allow:

Picklist

Lookup

Text

From:

objectInfo.fields

Use dual listbox + drag reorder.

5.2 Null handling strategy (handled in Apex)
if(value == null){
   switch(config.nullHandling){
      case 'STOP'
      case 'GROUP_UNKNOWN'
      case 'CARRY_FORWARD'
   }
}
EPIC 4 — Generate Sankey
6.1 Apex Query Builder

Dynamic SOQL:

SELECT Id, StageName, OwnerId, Amount
FROM Opportunity
WHERE <filters>
LIMIT :limitSize
6.2 Path Aggregation Algorithm

For each record:

stage1 → stage2 → stage3

Build transitions:

(stage1 → stage2) += metric
(stage2 → stage3) += metric

Store as:

Map<PathKey, Decimal>
6.3 Return DS-ready format
{
  nodes: [{ name, columnIndex }],
  links: [{ source, target, value, recordIds }]
}
6.4 Client Rendering (DS Sankey)

Use D3 or your DS wrapper.

LWC lifecycle:

renderedCallback() {
  if(this.data && !this.chart){
     this.initChart()
  }
}
EPIC 5 — Record Trace Mode
7.1 Record selector

Use returned records.

Highlight logic:

opacity = recordInPath ? 1 : 0.15
7.2 Open record

Use NavigationMixin:

this[NavigationMixin.Navigate]({
  type: 'standard__recordPage',
  attributes: {
    recordId,
    actionName: 'view'
  }
})
EPIC 6 — Flow Trace Mode

Interaction model:

Click node → emit event → filter links:

handleNodeSelect(event){
   this.traceNode = event.detail
}

Recompute:

upstream

downstream

KPIs

Client-side only → no server roundtrip.

EPIC 7 — Guided Insights

Computed in Apex for scale:

dropOffRate
conversionRate
topPaths
avgAmount

Top paths algorithm:

GROUP BY full path string
ORDER BY metric DESC
LIMIT 10
EPIC 8 — Performance
9.1 No query on load

Guard:

if(!this.configReady) return
9.2 Caching
Client

Store last config hash.

Server
@AuraEnabled(cacheable=true)

For identical configs.

For large datasets:

enforce LIMIT

show warning UI

EPIC 9 — Save & Reuse
10.1 Storage options
Option A (recommended)

Custom Object:

DS_Sankey_Config__c

Fields:

Object

Filters JSON

Path JSON

Metric

Owner

10.2 Load saved config

On select:

this.config = JSON.parse(savedConfig)

No rebuild.

11. State Management in LWC

Use a single store:

state = {
  config,
  data,
  ui: {
    loading,
    traceMode,
    selectedRecord,
    selectedNode
  }
}
12. Security

Enforce in Apex:

WITH SECURITY_ENFORCED

Check:

FLS

Object access

13. Governor Strategy

Key protections:

LIMIT records

Use maps not nested loops

Avoid per-record SOQL

14. Test Strategy
Apex

Path aggregation correctness

Null handling modes

Large dataset performance

LWC

Empty state

Config flow

Trace interactions

15. Suggested Component Breakdown
dsSankeyBuilder
 ├── dsObjectPicker
 ├── dsFilterBuilder
 ├── dsPathSelector
 ├── dsMetricSelector
 ├── dsSankeyChart
 ├── dsTracePanel
 ├── dsInsightsPanel
 └── dsSavedConfigs