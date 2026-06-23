// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import * as Y from "yjs";
import { StoreValue } from "@super-store/store";
import { useStore, useStoreSelector } from "../index";

afterEach(cleanup);

describe("useStore", () => {
  it("renders the initial value and updates on set()", () => {
    const store = new StoreValue(0);
    function Counter() {
      const n = useStore(store);
      return <div data-testid="n">{n}</div>;
    }
    render(<Counter />);
    expect(screen.getByTestId("n").textContent).toBe("0");
    act(() => {
      store.set(5);
    });
    expect(screen.getByTestId("n").textContent).toBe("5");
  });

  it("renders an object store and reflects update()", () => {
    const store = new StoreValue({ x: 1, y: 2 });
    function View() {
      const { x, y } = useStore(store);
      return <div data-testid="xy">{`${x},${y}`}</div>;
    }
    render(<View />);
    expect(screen.getByTestId("xy").textContent).toBe("1,2");
    act(() => {
      store.update({ x: 10 });
    });
    expect(screen.getByTestId("xy").textContent).toBe("10,2");
  });

  it("re-renders when a nested child StoreValue changes", () => {
    const x = new StoreValue(1);
    const y = new StoreValue(2);
    const pos = new StoreValue({ x, y });
    function View() {
      const snap = useStore(pos);
      return <div data-testid="p">{`${snap.x}/${snap.y}`}</div>;
    }
    render(<View />);
    expect(screen.getByTestId("p").textContent).toBe("1/2");
    act(() => {
      x.set(99);
    });
    expect(screen.getByTestId("p").textContent).toBe("99/2");
  });

  it("does not re-render when an equal value is set", () => {
    const store = new StoreValue({ x: 1 }, { isEqual: (a, b) => a.x === b.x });
    const renders = vi.fn();
    function View() {
      renders();
      const { x } = useStore(store);
      return <div>{x}</div>;
    }
    render(<View />);
    expect(renders).toHaveBeenCalledTimes(1);
    act(() => {
      store.set({ x: 1 }); // equal under isEqual
    });
    expect(renders).toHaveBeenCalledTimes(1);
  });

  it("works against a Yjs-bound store", () => {
    const store = new StoreValue({ count: 0 }, { doc: new Y.Doc(), name: "s" });
    function View() {
      const { count } = useStore(store);
      return <div data-testid="c">{count}</div>;
    }
    render(<View />);
    expect(screen.getByTestId("c").textContent).toBe("0");
    act(() => {
      store.update({ count: 3 });
    });
    expect(screen.getByTestId("c").textContent).toBe("3");
  });
});

describe("useStoreSelector", () => {
  it("re-renders only when the selected slice changes", () => {
    const a = new StoreValue("idle");
    const b = new StoreValue(0);
    const store = new StoreValue({ a, b });
    const renders = vi.fn();
    function View() {
      renders();
      const bVal = useStoreSelector(store, (s) => s.b);
      return <div data-testid="b">{bVal}</div>;
    }
    render(<View />);
    expect(renders).toHaveBeenCalledTimes(1);

    // Change `a`: store emits, but selected `b` is unchanged → no re-render.
    act(() => {
      a.set("dragging");
    });
    expect(renders).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("b").textContent).toBe("0");

    // Change `b`: selected slice changes → re-render.
    act(() => {
      b.set(7);
    });
    expect(renders).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("b").textContent).toBe("7");
  });

  it("respects a custom isEqual comparator", () => {
    const store = new StoreValue({ items: [1, 2, 3] as number[] });
    const renders = vi.fn();
    const shallowArrayEq = (x: number[], y: number[]) =>
      x.length === y.length && x.every((v, i) => v === y[i]);
    function View() {
      renders();
      const items = useStoreSelector(store, (s) => s.items, shallowArrayEq);
      return <div data-testid="len">{items.length}</div>;
    }
    render(<View />);
    expect(renders).toHaveBeenCalledTimes(1);

    // New array, same contents → custom isEqual bails, no re-render.
    act(() => {
      store.set({ items: [1, 2, 3] });
    });
    expect(renders).toHaveBeenCalledTimes(1);

    // Different contents → re-render.
    act(() => {
      store.set({ items: [1, 2, 3, 4] });
    });
    expect(renders).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("len").textContent).toBe("4");
  });
});
