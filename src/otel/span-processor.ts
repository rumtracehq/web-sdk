import type { Attributes } from '../types';

export interface SpanLike {
  setAttributes(attributes: Attributes): void;
}

export class RumAttributeSpanProcessor {
  constructor(private readonly getAttributes: () => Attributes) {}

  onStart(span: SpanLike): void {
    span.setAttributes(this.getAttributes());
  }

  onEnd(): void {}

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
