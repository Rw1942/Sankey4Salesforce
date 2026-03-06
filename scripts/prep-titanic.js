/**
 * Transforms the raw Titanic CSV into a Salesforce-ready CSV
 * with plain-English picklist values and derived categorical fields.
 *
 * Input:  data/titanic-raw.csv   (1,309 rows from YBI-Foundation)
 * Output: data/titanic-sf.csv    (same rows, Salesforce API field names)
 *
 * Run with: npm run prep:titanic
 */
const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const RAW_CSV = path.join(ROOT, 'data', 'titanic-raw.csv');
const OUT_CSV = path.join(ROOT, 'data', 'titanic-sf.csv');

// ---------------------------------------------------------------------------
// CSV parser — handles quoted fields with commas and escaped quotes
// ---------------------------------------------------------------------------
function parseCSV(text) {
    const rows = [];
    let i = 0;
    const len = text.length;

    while (i < len) {
        const row = [];
        while (i < len) {
            let value = '';
            if (text[i] === '"') {
                i++;
                while (i < len) {
                    if (text[i] === '"') {
                        if (i + 1 < len && text[i + 1] === '"') {
                            value += '"';
                            i += 2;
                        } else {
                            i++;
                            break;
                        }
                    } else {
                        value += text[i];
                        i++;
                    }
                }
            } else {
                while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
                    value += text[i];
                    i++;
                }
            }
            row.push(value);
            if (i < len && text[i] === ',') {
                i++;
            } else {
                break;
            }
        }
        if (i < len && text[i] === '\r') i++;
        if (i < len && text[i] === '\n') i++;
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
            rows.push(row);
        }
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Title extraction and normalisation
// ---------------------------------------------------------------------------
const TITLE_MAP = {
    Mr:       'Mr',
    Mrs:      'Mrs',
    Mme:      'Mrs',
    Miss:     'Miss',
    Mlle:     'Miss',
    Ms:       'Miss',
    Master:   'Master',
    Dr:       'Dr',
    Rev:      'Clergy',
    Col:      'Officer',
    Major:    'Officer',
    Capt:     'Officer',
    Sir:      'Titled',
    Lady:     'Titled',
    Countess: 'Titled',
    Jonkheer: 'Titled',
    Don:      'Titled',
    Dona:     'Titled',
    the:      'Titled'   // "the Countess"
};

function extractTitle(name) {
    const m = name.match(/,\s*([\w]+)\./);
    if (!m) return 'Mr';
    return TITLE_MAP[m[1]] || 'Mr';
}

// ---------------------------------------------------------------------------
// Derived field helpers
// ---------------------------------------------------------------------------
function ageGroup(age) {
    if (age === '' || age == null || isNaN(Number(age))) return 'Unknown';
    const n = Number(age);
    if (n <= 12) return 'Child';
    if (n <= 19) return 'Teen';
    if (n <= 35) return 'Young Adult';
    if (n <= 55) return 'Middle Aged';
    return 'Senior';
}

function fareCategory(fare) {
    if (fare === '' || fare == null || isNaN(Number(fare))) return '';
    const n = Number(fare);
    if (n < 10)  return 'Budget';
    if (n < 30)  return 'Standard';
    if (n < 100) return 'Premium';
    return 'Luxury';
}

function deck(cabin) {
    if (!cabin) return 'Unknown';
    const first = cabin.trim().charAt(0).toUpperCase();
    if ('ABCDEFGT'.includes(first)) return first;
    return 'Unknown';
}

function familyGroup(sibsp, parch) {
    const total = (Number(sibsp) || 0) + (Number(parch) || 0);
    if (total === 0)  return 'Solo';
    if (total <= 3)   return 'Small Family';
    return 'Large Family';
}

const CLASS_MAP  = { '1': 'First', '2': 'Second', '3': 'Third' };
const PORT_MAP   = { S: 'Southampton', C: 'Cherbourg', Q: 'Queenstown' };

// ---------------------------------------------------------------------------
// Escape a value for CSV output (quote if it contains comma, quote, or newline)
// ---------------------------------------------------------------------------
function csvEscape(val) {
    if (val == null) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const raw = fs.readFileSync(RAW_CSV, 'utf8');
const rows = parseCSV(raw);
const header = rows[0];

const col = {};
header.forEach((h, i) => { col[h.replace(/"/g, '').trim().toLowerCase()] = i; });

const SF_HEADERS = [
    'Passenger_Name__c',
    'Title__c',
    'Survived__c',
    'Travel_Class__c',
    'Sex__c',
    'Age__c',
    'Age_Group__c',
    'Port_of_Embarkation__c',
    'Fare__c',
    'Fare_Category__c',
    'Deck__c',
    'Cabin__c',
    'Ticket_Number__c',
    'Siblings_Spouses__c',
    'Parents_Children__c',
    'Family_Group__c',
    'Had_Lifeboat__c',
    'Lifeboat__c',
    'Home_Destination__c'
];

const outRows = [SF_HEADERS.join(',')];

for (let r = 1; r < rows.length; r++) {
    const d = rows[r];
    if (d.length < header.length - 1) continue;

    const name     = d[col['name']]      || '';
    const survived = d[col['survived']]   || '0';
    const pclass   = d[col['pclass']]     || '';
    const sex      = d[col['sex']]        || '';
    const age      = d[col['age']]        || '';
    const sibsp    = d[col['sibsp']]      || '0';
    const parch    = d[col['parch']]      || '0';
    const ticket   = d[col['ticket']]     || '';
    const fare     = d[col['fare']]       || '';
    const cabin    = d[col['cabin']]      || '';
    const embarked = d[col['embarked']]   || '';
    const boat     = d[col['boat']]       || '';
    const homeDest = d[col['home.dest']]  || '';

    const values = [
        csvEscape(name),
        extractTitle(name),
        survived === '1' ? 'Yes' : 'No',
        CLASS_MAP[pclass] || pclass,
        sex.charAt(0).toUpperCase() + sex.slice(1),
        age,
        ageGroup(age),
        PORT_MAP[embarked] || '',
        fare,
        fareCategory(fare),
        deck(cabin),
        csvEscape(cabin),
        csvEscape(ticket),
        sibsp,
        parch,
        familyGroup(sibsp, parch),
        boat.trim() ? 'Yes' : 'No',
        csvEscape(boat),
        csvEscape(homeDest)
    ];
    outRows.push(values.join(','));
}

fs.writeFileSync(OUT_CSV, outRows.join('\n') + '\n', 'utf8');
console.log('Wrote ' + (outRows.length - 1) + ' rows to ' + OUT_CSV);
