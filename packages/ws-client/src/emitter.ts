/**
 * 极简事件发射器 — 无依赖、TS 强类型。
 */

export type Listener<T> = (payload: T) => void;
export type Unsubscribe = () => void;

export class Emitter<EventMap extends Record<string, unknown>> {
  private listeners: { [K in keyof EventMap]?: Set<Listener<EventMap[K]>> } = {};

  on<K extends keyof EventMap>(event: K, fn: Listener<EventMap[K]>): Unsubscribe {
    let bucket = this.listeners[event];
    if (!bucket) {
      bucket = new Set();
      this.listeners[event] = bucket;
    }
    bucket.add(fn);
    return () => {
      bucket?.delete(fn);
    };
  }

  off<K extends keyof EventMap>(event: K, fn: Listener<EventMap[K]>): void {
    this.listeners[event]?.delete(fn);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const bucket = this.listeners[event];
    if (!bucket) return;
    // 拷贝,避免回调中 off 影响迭代
    for (const fn of [...bucket]) {
      try {
        fn(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[ws-client/emitter] listener error:", err);
      }
    }
  }

  removeAll(): void {
    this.listeners = {};
  }
}
