import { createRoot } from "react-dom/client";
import { StoreValue } from "@super-store/store";
import { useStore } from "@super-store/react";
import "./styles.css";

// M3 scaffold smoke screen — proves the @super-store + React + Vite pipeline
// resolves and typechecks. Replaced by <App /> in M5.
const counter = new StoreValue(0);

function Smoke() {
  const n = useStore(counter);
  return (
    <div className="wrap">
      <button onClick={() => counter.set(n + 1)}>count {n}</button>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<Smoke />);
