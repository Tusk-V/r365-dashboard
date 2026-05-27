// Load an Apps Script source file into a Node sandbox so its top-level
// function declarations and `var` configs are testable. Stubs the GAS-only
// globals (Logger, Utilities, Session) so functions can run end-to-end.
//
// Source files stay byte-identical — no module.exports pollution.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APPS_SCRIPT_DIR = path.join(__dirname, '..', '..', 'apps-script');

function makeSandbox() {
  // Share primordials so Dates / Arrays / Objects created in test code pass
  // `instanceof Date` (etc.) inside the sandboxed source. Without this, vm
  // gives the context its own constructors and cross-realm checks fail.
  return {
    Date, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite,
    Logger: { log: () => {} },
    Utilities: {
      formatDate: (date, _tz, fmt) => {
        const pad = (n) => String(n).padStart(2, '0');
        const M = date.getMonth() + 1;
        const d = date.getDate();
        const y = date.getFullYear();
        const HH = pad(date.getHours());
        const mm = pad(date.getMinutes());
        if (fmt === 'M/d/yyyy HH:mm') return `${M}/${d}/${y} ${HH}:${mm}`;
        return date.toISOString();
      }
    },
    Session: { getScriptTimeZone: () => 'America/Chicago' },
    SpreadsheetApp: undefined,
    UrlFetchApp: undefined,
    PropertiesService: undefined,
    R365: undefined,
    MailApp: undefined,
    CacheService: undefined,
    console
  };
}

function loadAppsScriptFiles(...filenames) {
  const sandbox = makeSandbox();
  vm.createContext(sandbox);
  for (const f of filenames) {
    const src = fs.readFileSync(path.join(APPS_SCRIPT_DIR, f), 'utf8');
    vm.runInContext(src, sandbox, { filename: f });
  }
  return sandbox;
}

module.exports = { loadAppsScriptFiles };
