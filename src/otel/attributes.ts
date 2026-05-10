import type { Attributes, AttributeValue } from '../types';
import { SessionManager } from '../core/session';
import { UserIdentifierStore } from '../core/user';

export class AttributeStore {
  private readonly globalAttributes = new Map<string, AttributeValue>();

  constructor(
    private readonly session: SessionManager,
    private readonly users: UserIdentifierStore
  ) {}

  setGlobalAttribute(key: string, value: AttributeValue): void {
    this.globalAttributes.set(key, normalizeAttributeValue(value));
  }

  removeGlobalAttribute(key: string): void {
    this.globalAttributes.delete(key);
  }

  current(extra: Attributes = {}): Attributes {
    const out: Attributes = {
      'session.id': this.session.id,
      'session.sampled': this.session.sampled,
      ...Object.fromEntries(this.globalAttributes),
      ...this.users.resourceAttributes()
    };
    if (this.session.routeCurrent) out['route.current'] = this.session.routeCurrent;
    for (const [key, value] of Object.entries(extra)) out[key] = normalizeAttributeValue(value);
    return out;
  }
}

function normalizeAttributeValue(value: unknown): AttributeValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.filter((item): item is string | number | boolean => {
      return typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean';
    });
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
