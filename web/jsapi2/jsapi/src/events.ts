/** Typed event listener registration, shared by the API's event sources. */
export type Listener<T> = (event: T) => void;

/** Removes a listener added with `addEventListener`. */
export type RemoverFn = () => void;

export class EventEmitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** Adds a listener, and returns a function that removes it. */
  addEventListener<K extends keyof Events>(type: K, listener: Listener<Events[K]>): RemoverFn {
    let set = this.listeners.get(type);
    if (set == null) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => this.removeEventListener(type, listener);
  }

  removeEventListener<K extends keyof Events>(type: K, listener: Listener<Events[K]>): void {
    this.listeners.get(type)?.delete(listener as Listener<never>);
  }

  protected emit<K extends keyof Events>(type: K, event: Events[K]): void {
    const set = this.listeners.get(type);
    if (set == null) {
      return;
    }
    for (const listener of [...set]) {
      try {
        (listener as Listener<Events[K]>)(event);
      } catch (e) {
        console.error(`Error in ${String(type)} listener`, e);
      }
    }
  }

  protected removeAllListeners(): void {
    this.listeners.clear();
  }
}
