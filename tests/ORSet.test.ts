import { ORSet } from "../src/crdt/ORSet";

describe("ORSet", () => {
  it("starts empty", () => {
    const s = new ORSet("A");
    expect(s.elements()).toEqual([]);
  });

  it("add makes element visible", () => {
    const s = new ORSet("A");
    s.add("apple");
    expect(s.contains("apple")).toBe(true);
    expect(s.elements()).toContain("apple");
  });

  it("remove hides element", () => {
    const s = new ORSet("A");
    s.add("apple");
    s.remove("apple");
    expect(s.contains("apple")).toBe(false);
  });

  it("remove of absent element is a no-op", () => {
    const s = new ORSet("A");
    expect(() => s.remove("ghost")).not.toThrow();
    expect(s.elements()).toEqual([]);
  });

  it("can re-add after remove", () => {
    const s = new ORSet("A");
    s.add("apple");
    s.remove("apple");
    s.add("apple");
    expect(s.contains("apple")).toBe(true);
  });

  it("merge is idempotent", () => {
    const s = new ORSet("A");
    s.add("apple");
    const state = s.getState();
    s.merge(state);
    s.merge(state);
    expect(s.elements()).toEqual(["apple"]);
  });

  it("merge is commutative", () => {
    const a = new ORSet("A");
    const b = new ORSet("B");
    a.add("apple");
    b.add("banana");

    const ab = new ORSet("X");
    ab.merge(a.getState());
    ab.merge(b.getState());

    const ba = new ORSet("X");
    ba.merge(b.getState());
    ba.merge(a.getState());

    expect(ab.elements().sort()).toEqual(ba.elements().sort());
  });

  it("merge is associative", () => {
    const a = new ORSet("A");
    const b = new ORSet("B");
    const c = new ORSet("C");
    a.add("alpha");
    b.add("beta");
    c.add("gamma");

    const left = new ORSet("X");
    left.merge(a.getState());
    left.merge(b.getState());
    left.merge(c.getState());

    const bc = new ORSet("Y");
    bc.merge(b.getState());
    bc.merge(c.getState());
    const right = new ORSet("Z");
    right.merge(a.getState());
    right.merge(bc.getState());

    expect(left.elements().sort()).toEqual(right.elements().sort());
  });

  it("add wins over concurrent remove", () => {
    const a = new ORSet("A");
    a.add("apple");

    const b = new ORSet("B");
    b.merge(a.getState());

    a.remove("apple");
    b.add("apple");
    a.merge(b.getState());
    b.merge(a.getState());

    expect(a.contains("apple")).toBe(true);
    expect(b.contains("apple")).toBe(true);
  });

  it("remove wins over same-node previous add", () => {
    const a = new ORSet("A");
    a.add("x");
    a.remove("x");

    const b = new ORSet("B");
    b.merge(a.getState());

    expect(b.contains("x")).toBe(false);
  });

  it("multiple elements coexist independently", () => {
    const s = new ORSet("A");
    s.add("a");
    s.add("b");
    s.add("c");
    s.remove("b");

    expect(s.contains("a")).toBe(true);
    expect(s.contains("b")).toBe(false);
    expect(s.contains("c")).toBe(true);
    expect(s.elements()).toEqual(["a", "c"]);
  });

  it("restores state correctly from serialised form", () => {
    const original = new ORSet("A");
    original.add("hello");
    original.add("world");
    original.remove("hello");

    const restored = new ORSet("A", original.getState());
    expect(restored.contains("hello")).toBe(false);
    expect(restored.contains("world")).toBe(true);

    restored.add("new-item");
    expect(restored.contains("new-item")).toBe(true);
  });
});
