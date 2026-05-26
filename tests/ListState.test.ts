import { LWWRegister } from "../src/crdt/LWWRegister";
import { ORSet } from "../src/crdt/ORSet";

interface TestList {
  nodeId: string;
  todos: ORSet;
  completed: ORSet;
  title: LWWRegister<string>;
  texts: Map<string, LWWRegister<string>>;
}

function makeList(nodeId: string): TestList {
  return {
    nodeId,
    todos: new ORSet(nodeId),
    completed: new ORSet(nodeId),
    title: new LWWRegister<string>(nodeId),
    texts: new Map(),
  };
}

function addTodo(list: TestList, text: string): string {
  const id = Math.random().toString(36).slice(2, 10);
  const reg = new LWWRegister<string>(list.nodeId);
  reg.set(text);
  list.texts.set(id, reg);
  list.todos.add(id);
  return id;
}

function sync(target: TestList, source: TestList): void {
  target.todos.merge(source.todos.getState());
  target.completed.merge(source.completed.getState());
  target.title.merge(source.title.getState());
  for (const [id, reg] of source.texts) {
    const existing = target.texts.get(id);
    if (existing) existing.merge(reg.getState());
    else target.texts.set(id, new LWWRegister<string>(target.nodeId, reg.getState()));
  }
}

function todoTexts(list: TestList): string[] {
  return list.todos.elements().map((id) => list.texts.get(id)?.get() ?? "").sort();
}

describe("Concurrent conflict scenarios", () => {
  it("concurrent adds both survive after sync", () => {
    const a = makeList("A");
    const b = makeList("B");

    addTodo(a, "task from A");
    addTodo(b, "task from B");

    sync(a, b);
    sync(b, a);

    expect(todoTexts(a)).toEqual(["task from A", "task from B"]);
    expect(todoTexts(b)).toEqual(["task from A", "task from B"]);
  });

  it("concurrent title renames converge regardless of merge order", () => {
    const a = makeList("A");
    const b = makeList("B");

    a.title.set("A's List", 100);
    b.title.set("B's List", 200);

    sync(a, b);
    sync(b, a);

    expect(a.title.get()).toBe(b.title.get());
    expect(a.title.get()).toBe("B's List");
  });

  it("three-way sync converges regardless of order", () => {
    const a = makeList("A");
    const b = makeList("B");
    const c = makeList("C");

    addTodo(a, "task from A");
    addTodo(b, "task from B");
    addTodo(c, "task from C");

    const m1 = makeList("X");
    sync(m1, a); sync(m1, b); sync(m1, c);

    const m2 = makeList("Y");
    sync(m2, c); sync(m2, a); sync(m2, b);

    expect(todoTexts(m1)).toEqual(todoTexts(m2));
  });

  it("concurrent text edit and delete: delete wins", () => {
    const a = makeList("A");
    const b = makeList("B");

    const id = addTodo(a, "original");
    sync(b, a);

    a.texts.get(id)!.set("edited");
    b.todos.remove(id);

    sync(a, b);
    sync(b, a);

    expect(a.todos.elements()).toEqual(b.todos.elements());
    expect(a.todos.contains(id)).toBe(false);
  });

  it("two items with the same text are treated as separate", () => {
    const a = makeList("A");

    addTodo(a, "buy milk");
    addTodo(a, "buy milk");

    expect(a.todos.elements()).toHaveLength(2);
  });
});
