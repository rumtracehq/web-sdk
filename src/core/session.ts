export interface SessionState {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  sampled: boolean;
  routeCurrent?: string;
}

const SESSION_KEY = 'rum-web-sdk.session.id';
const ABSOLUTE_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const IDLE_MAX_AGE_MS = 30 * 60 * 1000;

export class SessionManager {
  private state: SessionState;
  private storage: Storage | undefined;

  constructor(sampleRate: number, private readonly now: () => number = () => Date.now()) {
    this.storage = safeSessionStorage();
    this.state = this.load(sampleRate);
    this.persist();
  }

  get id(): string {
    this.touch();
    return this.state.id;
  }

  get sampled(): boolean {
    return this.state.sampled;
  }

  get routeCurrent(): string | undefined {
    return this.state.routeCurrent;
  }

  setRouteCurrent(route: string): void {
    this.state.routeCurrent = route;
    this.touch();
  }

  private load(sampleRate: number): SessionState {
    const now = this.now();
    const stored = this.storage?.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as SessionState;
        const absoluteAge = now - parsed.createdAt;
        const idleAge = now - parsed.lastSeenAt;
        if (isUuidV4(parsed.id) && absoluteAge <= ABSOLUTE_MAX_AGE_MS && idleAge <= IDLE_MAX_AGE_MS) {
          return { ...parsed, lastSeenAt: now };
        }
      } catch {
        // Invalid persisted data is treated as an expired session.
      }
    }
    return {
      id: uuidV4(),
      createdAt: now,
      lastSeenAt: now,
      sampled: Math.random() < sampleRate
    };
  }

  private touch(): void {
    this.state.lastSeenAt = this.now();
    this.persist();
  }

  private persist(): void {
    try {
      this.storage?.setItem(SESSION_KEY, JSON.stringify(this.state));
    } catch {
      this.storage = undefined;
    }
  }
}

function safeSessionStorage(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

function uuidV4(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
