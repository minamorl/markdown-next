/* global Buffer */
const fs = require('node:fs');

// One newline-terminated record per completed child. A torn final append is
// discarded on resume; earlier records must remain valid JSON.
function decodeJournal(text) {
  const complete = text.slice(0, text.lastIndexOf('\n') + 1);
  const records = complete.trimEnd().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { records, completeBytes: Buffer.byteLength(complete), torn: complete.length !== text.length };
}

function loadJournal(file) {
  return decodeJournal(fs.readFileSync(file, 'utf8'));
}

function appendRecord(file, record, create = false) {
  const fd = fs.openSync(file, create ? 'ax' : 'a');
  try {
    fs.writeFileSync(fd, JSON.stringify(record) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { loadJournal, appendRecord, decodeJournal };
