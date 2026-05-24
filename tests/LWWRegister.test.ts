import { LWWRegister } from "../src/crdt/LWWRegister";

describe("LWWRegister", () => {
  it("starts with null value", () => {
    const r = new LWWRegister<string>("A");
    expect(r.get()).toBeNull();
  });

  it("stores and returns value", () => {
    const r = new LWWRegister<string>("A");
    r.set("hello", 100);
    expect(r.get()).toBe("hello");
  });

  it("last write wins on same node", () => {
    const r = new LWWRegister<string>("A");
    r.set("first", 100);
    r.set("second", 200);
    expect(r.get()).toBe("second");
  });

  it("higher timestamp wins on merge", () => {
    const a = new LWWRegister<string>("A");
    const b = new LWWRegister<string>("B");
    a.set("old", 100);
    b.set("new", 200);

    a.merge(b.getState());
    expect(a.get()).toBe("new");
  });

  it("lower timestamp loses on merge", () => {
    const a = new LWWRegister<string>("A");
    const b = new LWWRegister<string>("B");
    a.set("recent", 500);
    b.set("stale", 100);

    a.merge(b.getState());
    expect(a.get()).toBe("recent");
  });

  it("equal timestamp: lexicographically larger nodeId wins", () => {
    const a = new LWWRegister<string>("A");
    const b = new LWWRegister<string>("B");
    const ts = 1000;
    a.set("from-A", ts);
    b.set("from-B", ts);

    a.merge(b.getState());
    expect(a.get()).toBe("from-B");
  });

  it("merge is idempotent", () => {
    const a = new LWWRegister<string>("A");
    a.set("value", 100);
    const state = a.getState();
    a.merge(state);
    a.merge(state);
    expect(a.get()).toBe("value");
  });

  it("merge is commutative", () => {
    const a = new LWWRegister<string>("A");
    const b = new LWWRegister<string>("B");
    a.set("alpha", 300);
    b.set("beta", 400);

    const ab = new LWWRegister<string>("X");
    ab.merge(a.getState());
    ab.merge(b.getState());

    const ba = new LWWRegister<string>("X");
    ba.merge(b.getState());
    ba.merge(a.getState());

    expect(ab.get()).toBe(ba.get());
  });

  it("works with numbers", () => {
    const r = new LWWRegister<number>("A");
    r.set(42, 100);
    expect(r.get()).toBe(42);
  });
});
