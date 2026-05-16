import type { Attributes } from '../types';
import type { NormalizedOptions } from './options';
import { redactUrl } from './redactor';

interface NavigatorUserAgentDataBrand {
  brand: string;
  version: string;
}

interface NavigatorUserAgentData {
  brands?: NavigatorUserAgentDataBrand[];
  mobile?: boolean;
  platform?: string;
}

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: NavigatorUserAgentData;
}

interface NameVersion {
  name: string;
  version?: string;
}

export function browserContextAttributes(options: NormalizedOptions): Attributes {
  const attributes: Attributes = {};
  const nav = typeof navigator === 'undefined' ? undefined : navigator as NavigatorWithUserAgentData;
  const userAgent = nav?.userAgent ?? '';
  const browser = browserFromUserAgent(userAgent) ?? browserFromUserAgentData(nav?.userAgentData);
  const os = osFromUserAgent(userAgent, nav?.userAgentData?.platform);
  const device = deviceFromUserAgent(userAgent, nav?.userAgentData?.mobile);
  const language = firstNonEmpty([nav?.language, nav?.languages?.[0]]);
  const country = normalizeCountry(options.country);
  const version = firstNonEmpty([options.release, options.websiteVersion]);
  const page = pageAttributes(options);
  const display = displayAttributes();

  if (browser?.name) attributes['browser.name'] = browser.name;
  if (browser?.version) attributes['browser.version'] = browser.version;
  if (language) attributes['browser.language'] = language;
  if (os?.name) attributes['os.name'] = os.name;
  if (os?.version) attributes['os.version'] = os.version;
  if (device.type) attributes['device.type'] = device.type;
  if (device.model) attributes['device.model'] = device.model;
  if (country) attributes['geo.country.iso_code'] = country;
  if (version) attributes['service.version'] = version;
  Object.assign(attributes, page, display);

  return attributes;
}

function pageAttributes(options: NormalizedOptions): Attributes {
  if (typeof document === 'undefined') return {};
  const attributes: Attributes = {};
  if (document.title) attributes['page.title'] = document.title;
  if (document.referrer) attributes['page.referrer'] = redactUrl(document.referrer, options.redact?.urlQueryKeys);
  return attributes;
}

function displayAttributes(): Attributes {
  const attributes: Attributes = {};
  if (typeof screen !== 'undefined') {
    setNumber(attributes, 'screen.width', screen.width);
    setNumber(attributes, 'screen.height', screen.height);
    setNumber(attributes, 'screen.avail_width', screen.availWidth);
    setNumber(attributes, 'screen.avail_height', screen.availHeight);
  }
  if (typeof window !== 'undefined') {
    setNumber(attributes, 'viewport.width', window.innerWidth);
    setNumber(attributes, 'viewport.height', window.innerHeight);
  }
  return attributes;
}

function browserFromUserAgent(userAgent: string): NameVersion | undefined {
  if (!userAgent) return undefined;
  const matchers: Array<[RegExp, string]> = [
    [/EdgA?\/([\d.]+)/, 'Microsoft Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/FxiOS\/([\d.]+)/, 'Firefox'],
    [/CriOS\/([\d.]+)/, 'Chrome'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari\//, 'Safari']
  ];
  if (/; wv\)|\bwv\b/.test(userAgent)) return { name: 'Android WebView', version: match(userAgent, /Chrome\/([\d.]+)/) };
  for (const [pattern, name] of matchers) {
    const version = match(userAgent, pattern);
    if (version) return { name, version };
  }
  return undefined;
}

function browserFromUserAgentData(userAgentData: NavigatorUserAgentData | undefined): NameVersion | undefined {
  const brands = userAgentData?.brands?.filter((brand) => !/not.*brand/i.test(brand.brand));
  if (!brands?.length) return undefined;
  const brand = brands.find((item) => !/^Chromium$/i.test(item.brand)) ?? brands[0];
  return { name: brand.brand, version: brand.version };
}

function osFromUserAgent(userAgent: string, platform: string | undefined): NameVersion | undefined {
  const source = `${platform ?? ''} ${userAgent}`;
  if (/Windows/i.test(source)) return { name: 'Windows', version: match(userAgent, /Windows NT ([\d.]+)/) };
  if (/Android/i.test(source)) return { name: 'Android', version: match(userAgent, /Android ([\d.]+)/) };
  if (/(iPhone|iPad|iPod)/i.test(source)) return { name: 'iOS', version: match(userAgent, /OS ([\d_]+)/)?.replace(/_/g, '.') };
  if (/Mac OS X|macOS|MacIntel/i.test(source)) return { name: 'macOS', version: match(userAgent, /Mac OS X ([\d_]+)/)?.replace(/_/g, '.') };
  if (/CrOS/i.test(source)) return { name: 'Chrome OS', version: match(userAgent, /CrOS [^\s]+ ([\d.]+)/) };
  if (/Linux/i.test(source)) return { name: 'Linux' };
  return undefined;
}

function deviceFromUserAgent(userAgent: string, mobile: boolean | undefined): { type: string; model?: string } {
  if (/bot|crawler|spider|crawling/i.test(userAgent)) return { type: 'bot' };
  if (/iPad/i.test(userAgent)) return { type: 'tablet', model: 'iPad' };
  if (/iPhone/i.test(userAgent)) return { type: 'mobile', model: 'iPhone' };
  if (/iPod/i.test(userAgent)) return { type: 'mobile', model: 'iPod' };
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return { type: 'tablet' };
  if (mobile || /Mobi|Android|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) return { type: 'mobile' };
  return { type: 'desktop' };
}

function normalizeCountry(country: string | undefined): string | undefined {
  const value = country?.trim();
  if (!value) return undefined;
  return value.length === 2 ? value.toUpperCase() : value;
}

function match(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1];
}

function setNumber(attributes: Attributes, key: string, value: unknown): void {
  if (typeof value === 'number' && Number.isFinite(value)) attributes[key] = value;
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim() !== '')?.trim();
}
