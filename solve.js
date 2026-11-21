// Fast drop-in for csv-reader 1.0.0.
//
// Written from the written policy in the competition rules (RULES.txt): one
// left-to-right pass over the text, commas and double quotes, a U+FEFF at the
// very start dropped, records ending at LF or CRLF, blank lines holding no
// record, a lone CR outside quotes dropped (stray_cr), quoted fields running
// to the next undoubled quote with "" inside as one quote and every CRLF or
// lone CR inside read as LF, junk after a closing quote appended as it stands
// (quote_junk), a quote that never closes read as a literal with the rest
// re-read as unquoted (unterminated_quote), quotes inside unquoted fields
// literal, fields kept as strings, rows padded or cut to the first record's
// width (short_row / long_row), errors {code, line, row} in the order met.
//
// Speed comes from cutting fields out with indexOf/substring instead of
// building them a character at a time: the common case (an unquoted field
// with no CR in it) is one slice, and a quoted field is scanned quote to
// quote the same way. Only the rare paths (a stray CR, a line break inside
// quotes) walk characters, and only over the short stretch that needs it.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of the text. */
const COMMA = 0;
const LINE = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on, and the index in rows it
  // takes (null for the header). Errors report these two.
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Current field's value and ending, written by the readers below.
  let fv = '';
  let fe = END;

  // Reads an unquoted field starting at pos, onto `prefix` ('' normally, '"'
  // when re-reading after a quote that never closed). Stops at a comma, a
  // line break, or the end of the text; a lone CR is dropped with stray_cr.
  // Only two searches run per field (',' and '\n'); a CR is looked for inside
  // the short cut-out segment, never by scanning the rest of the text.
  function readUnquoted(prefix) {
    fv = prefix;
    for (;;) {
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      let end;
      let kind;
      if (ci === -1) { end = ni === -1 ? n : ni; kind = ni === -1 ? END : LINE; }
      else if (ni === -1 || ci < ni) { end = ci; kind = COMMA; }
      else { end = ni; kind = LINE; }
      const seg = end > pos ? text.slice(pos, end) : '';
      const ri = seg.indexOf('\r');
      if (ri === -1) {
        fv += seg;
        pos = end;
        if (kind === COMMA) { pos += 1; fe = COMMA; return; }
        if (kind === LINE) { pos += 1; line += 1; fe = LINE; return; }
        fe = END;
        return;
      }
      // The segment holds a CR: a trailing one before a line break is the
      // CR of a CRLF, any other is a lone CR, dropped with stray_cr.
      let s = 0;
      for (;;) {
        const r = seg.indexOf('\r', s);
        if (r === -1) {
          fv += seg.slice(s);
          break;
        }
        fv += seg.slice(s, r);
        if (r === seg.length - 1 && kind === LINE) {
          pos = end + 1;
          line += 1;
          fe = LINE;
          return;
        }
        error('stray_cr');
        s = r + 1;
      }
      pos = end;
      if (kind === COMMA) { pos += 1; fe = COMMA; return; }
      if (kind === LINE) { pos += 1; line += 1; fe = LINE; return; }
      fe = END;
      return;
    }
  }

  // Appends `seg` to `value`, counting every line break in it and reading
  // each CRLF or lone CR as one LF. Only called when the stretch holds a CR
  // or an LF (the clean stretch is sliced by the caller).
  function appendWithBreaks(value, seg) {
    let start = 0;
    let i = 0;
    while (i < seg.length) {
      const c = seg.charCodeAt(i);
      if (c === 13) {
        value += seg.slice(start, i);
        value += '\n';
        line += 1;
        i += i + 1 < seg.length && seg.charCodeAt(i + 1) === 10 ? 2 : 1;
        start = i;
      } else if (c === 10) {
        value += seg.slice(start, i);
        value += '\n';
        line += 1;
        i += 1;
        start = i;
      } else {
        i += 1;
      }
    }
    if (start < seg.length) value += seg.slice(start);
    return value;
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    for (;;) {
      const qi = text.indexOf('"', pos);
      if (qi === -1) {
        // The quote never closes: it is a literal, and the text after it is
        // read again as unquoted, from where it started.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        readUnquoted('"');
        return;
      }
      const seg = qi > pos ? text.slice(pos, qi) : '';
      if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) {
        value = value === '' ? seg : value + seg;
      } else {
        value = appendWithBreaks(value, seg);
      }
      if (text.charCodeAt(qi + 1) === 34) {
        // A doubled quote is one literal quote inside the field.
        value += '"';
        pos = qi + 2;
        continue;
      }
      // The closing quote.
      pos = qi + 1;
      if (pos >= n) { fv = value; fe = END; return; }
      const c = text.charCodeAt(pos);
      if (c === 44) { pos += 1; fv = value; fe = COMMA; return; }
      if (c === 10) { pos += 1; line += 1; fv = value; fe = LINE; return; }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fv = value;
        fe = LINE;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      readUnquoted(value);
      if (fv.length > value.length) error('quote_junk');
      return;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fv);
    } while (fe === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
