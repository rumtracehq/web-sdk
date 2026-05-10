import { afterEach, describe, expect, test } from 'vitest';
import { ErrorIsolator } from '../src/core/error-isolator';
import { SessionManager } from '../src/core/session';
import { UserIdentifierStore } from '../src/core/user';
import { AttributeStore } from '../src/otel/attributes';

describe('AttributeStore', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  test('merges session, route, user, global, and local attributes', () => {
    const session = new SessionManager(1, () => 1000);
    const users = new UserIdentifierStore(new ErrorIsolator());
    const store = new AttributeStore(session, users);

    session.setRouteCurrent('/cart');
    users.setUser('user-1', { plan: 'pro' });
    store.setGlobalAttribute('tenant.id', 'tenant-1');

    expect(store.current({ local: true })).toMatchObject({
      'session.id': session.id,
      'session.sampled': true,
      'route.current': '/cart',
      'enduser.id': 'user-1',
      'enduser.plan': 'pro',
      'tenant.id': 'tenant-1',
      local: true
    });
  });

  test('removeGlobalAttribute excludes later records', () => {
    const session = new SessionManager(1, () => 1000);
    const users = new UserIdentifierStore(new ErrorIsolator());
    const store = new AttributeStore(session, users);

    store.setGlobalAttribute('tenant.id', 'tenant-1');
    store.removeGlobalAttribute('tenant.id');

    expect(store.current()).not.toHaveProperty('tenant.id');
  });
});
