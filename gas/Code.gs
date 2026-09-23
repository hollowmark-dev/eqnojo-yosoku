/**
 * 推し予測 -- response log.
 *
 * One row per session. Appends only; never reads back to the page.
 *
 * WHAT IS DELIBERATELY NOT STORED
 *   No IP address, no User-Agent, no cookie, no Google account, no
 *   referrer, no e.parameter dump. Apps Script does not hand doPost the
 *   requester's IP or UA, and nothing here asks for them -- the payload
 *   is parsed field by field (see readBody) precisely so that a field
 *   added to the client later cannot silently start being logged.
 *
 *   Deploy as "Execute as: Me" + "Who has access: Anyone". Do NOT use
 *   "Execute as: User accessing", which would attach their identity.
 */

var SHEET_NAME = 'responses';
var HEADERS = ['timestamp', 'picks', 'oshi', 'proposed', 'completed'];
var MAX_PICKS = 12;
var MAX_OSHI = 3;
var MAX_PROPOSED = 3;

/** Allowed id shapes. Anything else is dropped, not stored. */
var RE_FACE = /^g\d{3}$/;
var RE_MEMBER = /^M\d{2}$/;

function doPost(e) {
  try {
    var body = readBody(e);
    if (body) {
      var sh = getSheet();
      sh.appendRow([
        new Date(),                       // server time, not client-claimed
        body.picks.join(' '),
        body.oshi.join(' '),
        body.proposed.join(' '),
        body.completed ? 1 : 0
      ]);
    }
  } catch (err) {
    // Swallow: the page is fired with mode:'no-cors' and never reads the
    // reply, so a failure here must not become a visible error there.
  }
  return ok();
}

/**
 * Browsers may send a CORS preflight or a plain GET probe. Answer both
 * harmlessly. There is no endpoint that returns stored data.
 */
function doGet(e) {
  return ok();
}

function ok() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Parse ONLY the five known fields, with length and shape limits. */
function readBody(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  var raw = e.postData.contents;
  if (raw.length > 4000) return null;            // nothing legitimate is big
  var o;
  try {
    o = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  return {
    picks: clean(o.picks, RE_FACE, MAX_PICKS),
    oshi: clean(o.oshi, RE_MEMBER, MAX_OSHI),
    proposed: clean(o.proposed, RE_MEMBER, MAX_PROPOSED),
    completed: o.completed === true
  };
}

function clean(arr, re, max) {
  if (!Array.isArray(arr)) return [];
  var out = [];
  for (var i = 0; i < arr.length && out.length < max; i++) {
    var v = arr[i];
    if (typeof v === 'string' && re.test(v)) out.push(v);
  }
  return out;
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Run this once from the editor (Run > testAppend) to confirm the sheet
 * is created and a row lands, before you wire up the site.
 */
function testAppend() {
  doPost({ postData: { contents: JSON.stringify({
    picks: ['g001', 'g002', 'bad!', 'g003'],
    oshi: ['M01', 'M02'],
    proposed: ['M03', 'M04', 'M05'],
    completed: true,
    sneakyExtraField: 'this must not appear in the sheet'
  }) } });
  Logger.log('testAppend done -- check the "responses" sheet. ' +
             'The row should show 3 picks (bad! dropped) and no extra column.');
}
