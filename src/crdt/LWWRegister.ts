/**
 * LWW-Register (Last-Write-Wins Register)
 *
 * A CRDT register where concurrent writes are resolved by comparing the timestamps.
 * The write with the highest timestamp wins. If the timestamps are equal, the node with
 * the node with the alphabetically larger nodeId wins.
 */
export interface LWWRegisterState<T> {
  value: T | null;
  timestamp: number;
  nodeId: string;
}

export class LWWRegister<T> {
  private state: LWWRegisterState<T>;
  private readonly nodeId: string;

  constructor(nodeId: string, initialState?: LWWRegisterState<T>) {
    this.nodeId = nodeId;
    this.state = initialState ?? { value: null, timestamp: 0, nodeId };
  }

  set(value: T, timestamp: number = Date.now()): void {
    this.state = { value, timestamp, nodeId: this.nodeId };
  }

  get(): T | null {
    return this.state.value;
  }

  getState(): LWWRegisterState<T> {
    return { ...this.state };
  }

  merge(other: LWWRegisterState<T>): void {
    const otherWins =
      other.timestamp > this.state.timestamp ||
      (other.timestamp === this.state.timestamp &&
        other.nodeId > this.state.nodeId);

    if (otherWins) {
      this.state = { ...other };
    }
  }
}
