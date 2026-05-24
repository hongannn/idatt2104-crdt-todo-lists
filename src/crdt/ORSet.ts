/**
 * OR-Set (Observed-Remove Set)
 *
 * A CRDT set that supports both add and remove operations with correct semantics
 * for concurrent operations. If add and remove happens concurrently, add wins.
 *
 * Each add operation gives the item a unique tag.
 * Removing an element marks all its current tags as deleted.
 * A tag added concurrently survives the remove.
 *
 * An element is in the set if it has at least one tag in `added` that is
 * NOT in `removed`.
 */
export interface ORSetState {
  added: Record<string, string[]>;
  removed: string[];
}

export class ORSet {
  private added: Map<string, Set<string>>;
  private removed: Set<string>;
  private readonly nodeId: string;
  private tagCounter: number = 0;

  constructor(nodeId: string, initialState?: ORSetState) {
    this.nodeId = nodeId;
    this.added = new Map();
    this.removed = new Set();

    if (initialState) {
      for (const [element, tags] of Object.entries(initialState.added)) {
        this.added.set(element, new Set(tags));
      }
      for (const tag of initialState.removed) {
        this.removed.add(tag);
      }
      this.tagCounter = this.maxLocalCounter(initialState);
    }
  }

  add(element: string): string {
    const tag = `${this.nodeId}:${++this.tagCounter}`;
    if (!this.added.has(element)) {
      this.added.set(element, new Set());
    }
    this.added.get(element)!.add(tag);
    return tag;
  }

  remove(element: string): void {
    const tags = this.added.get(element);
    if (!tags) return;
    for (const tag of tags) {
      this.removed.add(tag);
    }
  }

  contains(element: string): boolean {
    const tags = this.added.get(element);
    if (!tags) return false;
    for (const tag of tags) {
      if (!this.removed.has(tag)) return true;
    }
    return false;
  }

  elements(): string[] {
    const result: string[] = [];
    for (const [element] of this.added) {
      if (this.contains(element)) {
        result.push(element);
      }
    }
    return result.sort();
  }

  getState(): ORSetState {
    const added: Record<string, string[]> = {};
    for (const [element, tags] of this.added) {
      added[element] = Array.from(tags);
    }
    return { added, removed: Array.from(this.removed) };
  }

  merge(other: ORSetState): void {
    for (const [element, tags] of Object.entries(other.added)) {
      if (!this.added.has(element)) {
        this.added.set(element, new Set());
      }
      const local = this.added.get(element)!;
      for (const tag of tags) {
        local.add(tag);
      }
    }
    for (const tag of other.removed) {
      this.removed.add(tag);
    }
  }

  private maxLocalCounter(state: ORSetState): number {
    let max = 0;
    const prefix = `${this.nodeId}:`;
    for (const tags of Object.values(state.added)) {
      for (const tag of tags) {
        if (tag.startsWith(prefix)) {
          const n = parseInt(tag.slice(prefix.length), 10);
          if (!isNaN(n) && n > max) max = n;
        }
      }
    }
    return max;
  }
}
