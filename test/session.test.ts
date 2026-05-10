import { afterEach, describe, expect, test, vi } from 'vitest';
import { SessionManager } from '../src/core/session';

const SESSION_KEY = 'rum-web-sdk.session.id';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('SessionManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  test('creates and persists a v4 UUID session', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const session = new SessionManager(1, () => 1000);

    expect(session.id).toMatch(UUID_V4);
    expect(session.sampled).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}')).toMatchObject({
      id: session.id,
      createdAt: 1000,
      sampled: true
    });
  });

  test('reuses a valid persisted session and sampling decision', () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        createdAt: 1000,
        lastSeenAt: 2000,
        sampled: false
      })
    );

    const session = new SessionManager(1, () => 3000);

    expect(session.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(session.sampled).toBe(false);
  });

  test('rotates an expired absolute-age session', () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        createdAt: 0,
        lastSeenAt: 1,
        sampled: true
      })
    );

    const session = new SessionManager(1, () => 4 * 60 * 60 * 1000 + 1);

    expect(session.id).not.toBe('11111111-1111-4111-8111-111111111111');
    expect(session.id).toMatch(UUID_V4);
  });

  test('tracks current route', () => {
    const session = new SessionManager(1, () => 1000);

    session.setRouteCurrent('/checkout');

    expect(session.routeCurrent).toBe('/checkout');
  });
});
