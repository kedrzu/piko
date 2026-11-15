/**
 * The rows of a CSV file (RFC 4180), each a list of its fields: fields split by commas, rows by line breaks (CRLF, LF or
 * CR), a field in double quotes may hold commas, line breaks and `""` for a quote. Lenient where files in the wild are:
 * a leading byte order mark is dropped, a line break at the end adds no empty row, rows may differ in length, a quote
 * inside an unquoted field is kept as text, and so is text after a closing quote.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    let i = text.startsWith('﻿') ? 1 : 0;

    while (i < text.length) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"';
                i += 2;
                continue;
            }
            if (char === '"') {
                quoted = false;
            } else {
                field += char;
            }
            i++;
            continue;
        }
        switch (char) {
            case '"':
                if (field === '') {
                    quoted = true;
                } else {
                    field += char;
                }
                i++;
                break;
            case ',':
                row.push(field);
                field = '';
                i++;
                break;
            case '\r':
            case '\n':
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
                i += char === '\r' && text[i + 1] === '\n' ? 2 : 1;
                break;
            default:
                field += char;
                i++;
        }
    }
    if (field !== '' || row.length > 0 || quoted) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
