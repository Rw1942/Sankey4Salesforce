/**
 * Provides flow data for the sankeyExplorer LWC.
 *
 * Return shape (JSON string):
 * {
 *   nodes:   [{ id: String, label: String }],
 *   links:   [{ source: String, target: String, value: Decimal }],
 *   records: [{ id: String, name: String, path: [{ source: String, target: String }] }]
 * }
 *
 * Swap the sample return for a real SOQL query when wiring to live data.
 */
public with sharing class SankeyDataController {

    @AuraEnabled(cacheable=true)
    public static String getSankeyData() {
        // ── Sample data (replace with SOQL-driven logic) ──────────────────
        List<Map<String,Object>> nodes = new List<Map<String,Object>>{
            new Map<String,Object>{ 'id' => 'Lead',        'label' => 'Lead' },
            new Map<String,Object>{ 'id' => 'Qualified',   'label' => 'Qualified' },
            new Map<String,Object>{ 'id' => 'Proposal',    'label' => 'Proposal' },
            new Map<String,Object>{ 'id' => 'Negotiation', 'label' => 'Negotiation' },
            new Map<String,Object>{ 'id' => 'ClosedWon',   'label' => 'Closed Won' },
            new Map<String,Object>{ 'id' => 'ClosedLost',  'label' => 'Closed Lost' }
        };

        List<Map<String,Object>> links = new List<Map<String,Object>>{
            new Map<String,Object>{ 'source' => 'Lead',        'target' => 'Qualified',   'value' => 120 },
            new Map<String,Object>{ 'source' => 'Lead',        'target' => 'ClosedLost',  'value' => 30  },
            new Map<String,Object>{ 'source' => 'Qualified',   'target' => 'Proposal',    'value' => 80  },
            new Map<String,Object>{ 'source' => 'Qualified',   'target' => 'ClosedLost',  'value' => 40  },
            new Map<String,Object>{ 'source' => 'Proposal',    'target' => 'Negotiation', 'value' => 55  },
            new Map<String,Object>{ 'source' => 'Proposal',    'target' => 'ClosedLost',  'value' => 25  },
            new Map<String,Object>{ 'source' => 'Negotiation', 'target' => 'ClosedWon',   'value' => 45  },
            new Map<String,Object>{ 'source' => 'Negotiation', 'target' => 'ClosedLost',  'value' => 10  }
        };

        List<Map<String,Object>> records = new List<Map<String,Object>>{
            new Map<String,Object>{
                'id'   => 'rec001',
                'name' => 'Sample Opportunity A',
                'path' => new List<Map<String,String>>{
                    new Map<String,String>{ 'source' => 'Lead',      'target' => 'Qualified'   },
                    new Map<String,String>{ 'source' => 'Qualified', 'target' => 'Proposal'    },
                    new Map<String,String>{ 'source' => 'Proposal',  'target' => 'Negotiation' },
                    new Map<String,String>{ 'source' => 'Negotiation','target' => 'ClosedWon'  }
                }
            }
        };

        Map<String,Object> result = new Map<String,Object>{
            'nodes'   => nodes,
            'links'   => links,
            'records' => records
        };

        return JSON.serialize(result);
    }
}
