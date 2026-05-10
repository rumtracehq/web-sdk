// Feature: rum-web-sdk, Property 33: Redaction invariants
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { redactHeaders, redactInteractionText, redactUrl } from '../src/core/redactor';

describe('redactUrl', () => {
  test('redacts sensitive query keys and preserves other values', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), fc.string({ maxLength: 20 })),
        (baseUrl, query) => {
          const url = new URL(baseUrl);
          for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
          url.searchParams.set('token', 'secret-value');

          const redacted = new URL(redactUrl(url.toString()));

          expect(redacted.searchParams.get('token')).toBe('[REDACTED]');
          for (const [key, value] of Object.entries(query)) {
            if (key.toLowerCase() !== 'token') expect(redacted.searchParams.get(key)).toBe(value);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('redactHeaders', () => {
  test('removes configured header keys case-insensitively', () => {
    expect(redactHeaders({ Authorization: 'Bearer x', accept: 'json' }, ['authorization'])).toEqual({ accept: 'json' });
  });
});

describe('redactInteractionText', () => {
  test('redacts sensitive input text', () => {
    const input = document.createElement('input');
    input.type = 'password';

    expect(redactInteractionText(input, 'secret')).toBe('[REDACTED]');
  });

  test('truncates non-sensitive text to 100 characters', () => {
    const button = document.createElement('button');

    expect(redactInteractionText(button, 'x'.repeat(120))).toHaveLength(100);
  });
});
