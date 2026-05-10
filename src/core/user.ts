import type { Attributes } from '../types';
import { ErrorIsolator } from './error-isolator';

export class UserIdentifierStore {
  private userId: string | undefined;
  private attributes: Attributes = {};

  constructor(private readonly isolator: ErrorIsolator) {}

  setUser(userId: string, attributes: Attributes = {}): void {
    if (typeof userId !== 'string' || userId.trim() === '') {
      this.isolator.warn('invalid-user-id', 'userId must be a non-empty string');
      return;
    }
    this.userId = userId;
    this.attributes = attributes;
  }

  clearUser(): void {
    this.userId = undefined;
    this.attributes = {};
  }

  resourceAttributes(): Attributes {
    if (!this.userId) return {};
    const out: Attributes = { 'enduser.id': this.userId };
    for (const [key, value] of Object.entries(this.attributes)) out[`enduser.${key}`] = value;
    return out;
  }
}
