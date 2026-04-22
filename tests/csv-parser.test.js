import { describe, it, expect } from 'vitest';
import { parseCSV, parseCSVLine } from '../js/csv-parser.js';

describe('parseCSVLine', () => {
    it('parses a simple comma-separated line', () => {
        expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('handles quoted fields containing commas', () => {
        expect(parseCSVLine('"hello, world",b')).toEqual(['hello, world', 'b']);
    });

    it('handles escaped double-quotes inside quoted fields', () => {
        expect(parseCSVLine('"say ""hello""",b')).toEqual(['say "hello"', 'b']);
    });

    it('handles empty fields', () => {
        expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    });

    it('handles a single field with no commas', () => {
        expect(parseCSVLine('only')).toEqual(['only']);
    });

    it('handles a trailing comma as an empty final field', () => {
        expect(parseCSVLine('a,b,')).toEqual(['a', 'b', '']);
    });
});

describe('parseCSV', () => {
    it('throws on a file with only one line (no data rows)', () => {
        expect(() => parseCSV('Worker,Rate')).toThrow('CSV file is empty or invalid');
    });

    it('throws on an empty string', () => {
        expect(() => parseCSV('')).toThrow('CSV file is empty or invalid');
    });

    it('parses headers and maps them onto row objects', () => {
        const csv = 'Worker,Rate to Bill\nAlice,150\nBob,200';
        const { headers, rows } = parseCSV(csv);
        expect(headers).toEqual(['Worker', 'Rate to Bill']);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({ Worker: 'Alice', 'Rate to Bill': '150' });
        expect(rows[1]).toEqual({ Worker: 'Bob', 'Rate to Bill': '200' });
    });

    it('strips quotes from header names', () => {
        const csv = '"Worker","Rate"\nAlice,100';
        const { headers } = parseCSV(csv);
        expect(headers).toEqual(['Worker', 'Rate']);
    });

    it('trims whitespace from header names', () => {
        const csv = ' Worker , Rate \nAlice,100';
        const { headers } = parseCSV(csv);
        expect(headers).toEqual(['Worker', 'Rate']);
    });

    it('handles quoted values in data rows', () => {
        const csv = 'Worker,Project\nAlice,"Big, Corp"';
        const { rows } = parseCSV(csv);
        expect(rows[0].Project).toBe('Big, Corp');
    });

    it('sets missing fields to empty string when row has fewer columns than headers', () => {
        const csv = 'A,B,C\n1,2';
        const { rows } = parseCSV(csv);
        expect(rows[0].C).toBe('');
    });

    it('ignores blank lines', () => {
        const csv = 'Worker,Rate\nAlice,100\n\nBob,200\n';
        const { rows } = parseCSV(csv);
        expect(rows).toHaveLength(2);
    });
});
