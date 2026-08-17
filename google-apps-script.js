const SHEET_ID = "18lMkWL6eO3r-NwmhS56GgOfzWLPD_fVJ4RboOmBfIKI";
const SHEET_NAME = "RSVP";
const HEADERS = ["id", "name", "phone", "side", "guests", "attendance", "events", "message", "submittedAt"];

function doGet() {
  const sheet = getRsvpSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || HEADERS;
  const entries = values.slice(1).filter(row => row.some(Boolean)).map(rowToEntry(headers));

  return jsonResponse({ ok: true, entries });
}

function doPost(event) {
  const sheet = getRsvpSheet();
  const payload = parsePayload(event);
  const entry = HEADERS.map(header => normalizeValue(header, payload[header]));

  sheet.appendRow(entry);
  return jsonResponse({ ok: true });
}

function getRsvpSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  const existingHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeaders = existingHeaders.some(Boolean);
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function parsePayload(event) {
  if (event && event.parameter && event.parameter.payload) {
    return JSON.parse(event.parameter.payload);
  }

  if (event && event.postData && event.postData.contents) {
    return JSON.parse(event.postData.contents);
  }

  return event && event.parameter ? event.parameter : {};
}

function rowToEntry(headers) {
  return row => headers.reduce((entry, header, index) => {
    entry[header] = row[index];
    return entry;
  }, {});
}

function normalizeValue(header, value) {
  if (header === "events" && Array.isArray(value)) {
    return value.join(", ");
  }

  return value || "";
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
