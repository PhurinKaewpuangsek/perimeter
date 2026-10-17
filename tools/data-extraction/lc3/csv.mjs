/**
 * Parses a CSV document, including commas and newlines inside quoted fields.
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  let afterQuote = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') {
        quoted = false
        afterQuote = true
      } else {
        cell += ch
      }
    } else if (afterQuote) {
      if (ch === ',') {
        row.push(cell)
        cell = ''
        afterQuote = false
      } else if (ch === '\n') {
        row.push(cell.replace(/\r$/, ''))
        rows.push(row)
        row = []
        cell = ''
        afterQuote = false
      } else if (ch !== '\r') {
        throw new Error('Malformed CSV: unexpected content after closing quote.')
      }
    } else if (ch === '"') {
      if (cell !== '') {
        throw new Error('Malformed CSV: quote must start a field.')
      }
      quoted = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }

  if (quoted) {
    throw new Error('Malformed CSV: unterminated quoted field.')
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }

  const [headers, ...data] = rows
  if (!headers || headers.length === 0 || headers.some((header) => header === '')) {
    throw new Error('Malformed CSV: missing or empty header.')
  }

  return data
    .filter((values) => values.some((value) => value !== ''))
    .map((values, index) => {
      if (values.length !== headers.length) {
        throw new Error(
          `Malformed CSV: row ${index + 2} has ${values.length} fields; expected ${headers.length}.`
        )
      }
      return Object.fromEntries(headers.map((header, i) => [header, values[i]]))
    })
}

/** Adds DynamoDB's schedule sort key and omits an unannounced event date. */
export function normalizeScheduleRecord(record) {
  const normalized = { ...record };
  if (!normalized.event_date) delete normalized.event_date;
  normalized.schedule_slot = `${normalized.day_of_week}#${normalized.start_time}#${normalized.event_code}`;
  return normalized;
}
