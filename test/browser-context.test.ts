import { afterEach, describe, expect, test, vi } from 'vitest';
import { ErrorIsolator } from '../src/core/error-isolator';
import { browserContextAttributes } from '../src/core/browser-context';
import { normalizeOptions } from '../src/core/options';

describe('browserContextAttributes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.title = '';
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });

  test('detects browser, OS, device, page, display, language, country, and website version attributes', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
      language: 'tr-TR',
      languages: ['tr-TR', 'en-US']
    });
    vi.stubGlobal('screen', {
      width: 390,
      height: 844,
      availWidth: 390,
      availHeight: 800
    });
    vi.stubGlobal('innerWidth', 375);
    vi.stubGlobal('innerHeight', 700);
    document.title = 'Checkout';
    Object.defineProperty(document, 'referrer', { value: 'https://example.com/home?token=secret&tab=1', configurable: true });
    const options = normalizeOptions({
      collectorUrl: 'https://collector.example/otlp',
      country: 'us',
      websiteVersion: '2026.05.16'
    }, new ErrorIsolator());

    expect(browserContextAttributes(options!)).toMatchObject({
      'browser.name': 'Safari',
      'browser.version': '17.2',
      'browser.language': 'tr-TR',
      'os.name': 'iOS',
      'os.version': '17.2',
      'device.type': 'mobile',
      'device.model': 'iPhone',
      'geo.country.iso_code': 'US',
      'service.version': '2026.05.16',
      'page.title': 'Checkout',
      'page.referrer': 'https://example.com/home?token=%5BREDACTED%5D&tab=1',
      'screen.width': 390,
      'screen.height': 844,
      'screen.avail_width': 390,
      'screen.avail_height': 800,
      'viewport.width': 375,
      'viewport.height': 700
    });
  });

  test('prefers release over websiteVersion for service.version', () => {
    vi.stubGlobal('navigator', { userAgent: '' });
    const options = normalizeOptions({
      collectorUrl: 'https://collector.example/otlp',
      release: '1.2.3',
      websiteVersion: 'ignored'
    }, new ErrorIsolator());

    expect(browserContextAttributes(options!)['service.version']).toBe('1.2.3');
  });
});
