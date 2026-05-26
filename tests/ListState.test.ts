import { LWWRegister } from "../src/crdt/LWWRegister";
import { ORSet } from "../src/crdt/ORSet";

interface TestList {
  todos: ORSet;
  completed: ORSet;
  title: LWWRegister<string>;
}

function makeList(nodeId: string): TestList {
  return {
    todos: new ORSet(nodeId),
    completed: new ORSet(nodeId),
    title: new LWWRegister<string>(nodeId),
  };
}

function sync(target: TestList, source: TestList): void {
  target.todos.merge(source.todos.getState());
  target.completed.merge(source.completed.getState());
  target.title.merge(source.title.getState());
}

describe("Concurrent conflict scenarios", () => {
  it("concurrent adds survives after sync", () => {
    const a = makeList("A");
    const b = makeList("B");

    a.todos.add("task from A");
    b.todos.add("task from B");

    sync(a, b);
    sync(b, a);
    expect(a.todos.elements().sort()).toEqual(["task from A", "task from B"]);
    expect(b.todos.elements().sort()).toEqual(["task from A", "task from B"]);
  });

  it("add wins over remove", () => {
    const a = makeList("A");
    const b = makeList("B");
    a.todos.add("shared");
    sync(b, a);

    a.todos.remove("shared");
    b.todos.add("shared");

    sync(a, b);
    sync(b, a);
    expect(a.todos.contains("shared")).toBe(true);
    expect(a.todos.elements()).toEqual(b.todos.elements());
  });

  it("concurrent renaming of titles converge regardless of the merge order", () => {
    const a = makeList("A");
    const b = makeList("B");
    a.title.set("A's List", 100);
    b.title.set("B's List", 200);

    sync(a, b);
    sync(b, a);

    expect(a.title.get()).toBe(b.title.get());
    expect(a.title.get()).toBe("B's List");
  });

  it("three-way sync converges regardless of the order", () => {
    const a = makeList("A");
    const b = makeList("B");
    const c = makeList("C");

    a.todos.add("task from A");
    b.todos.add("task from B");
    c.todos.add("task from C");

    const m1 = makeList("X");
    sync(m1, a);
    sync(m1, b);
    sync(m1, c);
    const m2 = makeList("Y");
    sync(m2, c);
    sync(m2, a);
    sync(m2, b);

    expect(m1.todos.elements().sort()).toEqual(m2.todos.elements().sort());
  });

  it("rename wins over delete", () => {
    const a = makeList("A");
    const b = makeList("B");

    a.todos.add("original");
    sync(b, a);

    a.todos.remove("original");
    a.todos.add("renamed");
    b.todos.remove("original");

    sync(a, b);
    sync(b, a);
    expect(a.todos.elements()).toEqual(b.todos.elements());
    expect(a.todos.contains("original")).toBe(false);
    expect(a.todos.contains("renamed")).toBe(true);
  });
});
