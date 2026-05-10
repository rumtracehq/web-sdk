import { describe, expect, test, vi } from 'vitest';
import { ErrorIsolator } from '../src/core/error-isolator';
import { UserIdentifierStore } from '../src/core/user';

describe('UserIdentifierStore', () => {
  test('maps user id and attributes to enduser resource attributes', () => {
    const store = new UserIdentifierStore(new ErrorIsolator());

    store.setUser('user-123', { plan: 'enterprise', beta: true });

    expect(store.resourceAttributes()).toEqual({
      'enduser.id': 'user-123',
      'enduser.plan': 'enterprise',
      'enduser.beta': true
    });
  });

  test('clearUser removes all user attributes', () => {
    const store = new UserIdentifierStore(new ErrorIsolator());

    store.setUser('user-123', { plan: 'enterprise' });
    store.clearUser();

    expect(store.resourceAttributes()).toEqual({});
  });

  test('invalid user id is ignored and warned about', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = new UserIdentifierStore(new ErrorIsolator());

    store.setUser('user-123');
    store.setUser('');

    expect(store.resourceAttributes()).toEqual({ 'enduser.id': 'user-123' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
