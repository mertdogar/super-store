<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";

const SIZE = 25; // 5×5
const SEED = new Set([0, 6, 12, 18, 24]); // a diagonal, so the demo isn't empty on load

type Grid = Record<string, boolean>;
const blank = (): Grid =>
  Object.fromEntries(Array.from({ length: SIZE }, (_, i) => [`c${i}`, SEED.has(i)]));

const gridA = ref<Grid>(blank());
const gridB = ref<Grid>(blank());
const updates = ref(0);
const bytesRelayed = ref(0);
const flow = ref<"ab" | "ba" | null>(null);
const ready = ref(false);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let storeA: any, storeB: any;
let reduceMotion = false;
const cleanups: Array<() => void> = [];
let flowTimer: ReturnType<typeof setTimeout> | undefined;

const cells = (g: Grid) => Array.from({ length: SIZE }, (_, i) => g[`c${i}`]);

onMounted(async () => {
  reduceMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const { StoreValue } = await import("@super-store/store");

  // Two independent documents — not shared state. B hydrates from A's encoded
  // state so both share one causal history (the README's peer-seeding step);
  // after that they stay in sync purely by relaying CRDT bytes between them.
  storeA = new StoreValue(blank());
  storeB = new StoreValue({});
  storeB.applyUpdate(storeA.encodeState());

  cleanups.push(storeA.subscribe(() => (gridA.value = storeA.getSnapshot())));
  cleanups.push(storeB.subscribe(() => (gridB.value = storeB.getSnapshot())));
  gridA.value = storeA.getSnapshot();
  gridB.value = storeB.getSnapshot();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relay = (target: any, dir: "ab" | "ba") => (update: Uint8Array, meta: { local: boolean }) => {
    if (!meta.local) return; // never echo a merge back — the {local} guard from the README
    bytesRelayed.value += update.byteLength;
    updates.value += 1;
    flow.value = dir;
    clearTimeout(flowTimer);
    flowTimer = setTimeout(() => (flow.value = null), 600);
    // A small wire latency so the propagation is visible, not instant.
    setTimeout(() => target.applyUpdate(update), reduceMotion ? 0 : 150);
  };
  cleanups.push(storeA.onUpdate(relay(storeB, "ab")));
  cleanups.push(storeB.onUpdate(relay(storeA, "ba")));

  ready.value = true;
});

onBeforeUnmount(() => {
  cleanups.forEach((fn) => fn());
  clearTimeout(flowTimer);
  storeA?.dispose?.();
  storeB?.dispose?.();
});

function toggle(which: "a" | "b", i: number) {
  if (!ready.value) return;
  const store = which === "a" ? storeA : storeB;
  const key = `c${i}`;
  store.set({ ...store.getSnapshot(), [key]: !store.getSnapshot()[key] });
}

function clearAll() {
  if (!ready.value) return;
  storeA.set(Object.fromEntries(Array.from({ length: SIZE }, (_, i) => [`c${i}`, false])));
}

function onCellKey(e: KeyboardEvent, which: "a" | "b", i: number) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggle(which, i);
  }
}
</script>

<template>
  <section class="sync-demo" aria-labelledby="sync-demo-title">
    <div class="sd-head">
      <h2 id="sync-demo-title" class="sd-title">Two stores, kept in sync</h2>
      <p class="sd-sub">
        Each grid below is its own <code>StoreValue</code>, backed by its own document — not shared
        state. Toggle a cell: your edit travels as CRDT bytes and merges into the other. Edit both at
        once; concurrent changes to different cells each win.
      </p>
    </div>

    <div class="sd-stage">
      <div class="sd-pane">
        <div class="sd-chrome">
          <span class="sd-dot" /><span class="sd-dot" /><span class="sd-dot" />
          <span class="sd-label">peer&nbsp;a</span>
        </div>
        <div class="sd-grid" role="group" aria-label="Peer A grid">
          <button
            v-for="(lit, i) in cells(gridA)"
            :key="'a' + i"
            class="sd-cell"
            :class="{ lit }"
            type="button"
            :aria-pressed="lit"
            :aria-label="`Peer A cell ${i + 1}, ${lit ? 'on' : 'off'}`"
            @click="toggle('a', i)"
            @keydown="onCellKey($event, 'a', i)"
          />
        </div>
      </div>

      <div class="sd-wire" :class="flow ? 'flow-' + flow : ''" aria-hidden="true">
        <span class="sd-wire-line" />
        <span class="sd-wire-pulse" />
      </div>

      <div class="sd-pane">
        <div class="sd-chrome">
          <span class="sd-dot" /><span class="sd-dot" /><span class="sd-dot" />
          <span class="sd-label">peer&nbsp;b</span>
        </div>
        <div class="sd-grid" role="group" aria-label="Peer B grid">
          <button
            v-for="(lit, i) in cells(gridB)"
            :key="'b' + i"
            class="sd-cell"
            :class="{ lit }"
            type="button"
            :aria-pressed="lit"
            :aria-label="`Peer B cell ${i + 1}, ${lit ? 'on' : 'off'}`"
            @click="toggle('b', i)"
            @keydown="onCellKey($event, 'b', i)"
          />
        </div>
      </div>
    </div>

    <div class="sd-status">
      <span class="sd-live"><span class="sd-live-dot" />live</span>
      <span class="sd-stat">{{ updates }} update{{ updates === 1 ? "" : "s" }} relayed</span>
      <span class="sd-sep">·</span>
      <span class="sd-stat">{{ bytesRelayed }} bytes</span>
      <button class="sd-clear" type="button" @click="clearAll" :disabled="!ready">Clear</button>
    </div>
  </section>
</template>

<style scoped>
.sync-demo {
  max-width: 1152px;
  margin: 0 auto;
  padding: 64px 24px 8px;
}

.sd-head {
  max-width: 60ch;
  margin: 0 auto 36px;
  text-align: center;
}
.sd-title {
  margin: 0 0 12px;
  font-size: clamp(1.6rem, 4vw, 2.25rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
  text-wrap: balance;
  color: var(--vp-c-text-1);
}
.sd-sub {
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  text-wrap: pretty;
}
.sd-sub code {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85em;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  padding: 1px 6px;
  border-radius: 4px;
}

.sd-stage {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: stretch;
  gap: 0;
  max-width: 760px;
  margin: 0 auto;
}

.sd-pane {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-alt);
  overflow: hidden;
}
.sd-chrome {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.sd-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--vp-c-gray-3);
}
.sd-label {
  margin-left: 6px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-2);
}

.sd-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 20px;
}
.sd-cell {
  aspect-ratio: 1;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  cursor: pointer;
  padding: 0;
  transition:
    background-color 0.18s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.18s,
    transform 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}
.sd-cell:hover {
  border-color: var(--vp-c-brand-1);
}
.sd-cell:active {
  transform: scale(0.9);
}
.sd-cell:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
.sd-cell.lit {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 1px var(--vp-c-brand-1), 0 4px 12px rgba(124, 58, 237, 0.28);
}

/* The wire: a hairline between the panes with a pulse that travels toward the
   receiving peer when bytes are relayed. */
.sd-wire {
  position: relative;
  width: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sd-wire-line {
  width: 100%;
  height: 2px;
  background: var(--vp-c-divider);
  border-radius: 4px;
}
.sd-wire-pulse {
  position: absolute;
  top: 50%;
  left: 0;
  width: 8px;
  height: 8px;
  margin-top: -4px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 10px 2px rgba(124, 58, 237, 0.55);
  opacity: 0;
}
.sd-wire.flow-ab .sd-wire-pulse {
  animation: pulse-ab 0.55s cubic-bezier(0.16, 1, 0.3, 1);
}
.sd-wire.flow-ba .sd-wire-pulse {
  animation: pulse-ba 0.55s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes pulse-ab {
  0% { left: 0; opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { left: calc(100% - 8px); opacity: 0; }
}
@keyframes pulse-ba {
  0% { left: calc(100% - 8px); opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { left: 0; opacity: 0; }
}

.sd-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 760px;
  margin: 24px auto 0;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  color: var(--vp-c-text-2);
}
.sd-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--vp-c-brand-1);
}
.sd-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.5);
  animation: live-blink 2s ease-in-out infinite;
}
@keyframes live-blink {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.5); }
  50% { box-shadow: 0 0 0 4px rgba(124, 58, 237, 0); }
}
.sd-sep {
  opacity: 0.5;
}
.sd-clear {
  margin-left: 4px;
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  background: transparent;
  color: var(--vp-c-text-2);
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
  transition: border-color 0.18s, color 0.18s;
}
.sd-clear:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
.sd-clear:disabled {
  opacity: 0.5;
  cursor: default;
}
.sd-clear:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

@media (max-width: 639px) {
  .sync-demo {
    padding: 48px 24px 8px;
  }
  .sd-stage {
    grid-template-columns: 1fr;
    gap: 0;
    max-width: 360px;
  }
  .sd-wire {
    width: 100%;
    height: 56px;
    flex-direction: column;
  }
  .sd-wire-line {
    width: 2px;
    height: 100%;
  }
  .sd-wire-pulse {
    top: 0;
    left: 50%;
    margin-top: 0;
    margin-left: -4px;
  }
  .sd-wire.flow-ab .sd-wire-pulse {
    animation: pulse-ab-v 0.55s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .sd-wire.flow-ba .sd-wire-pulse {
    animation: pulse-ba-v 0.55s cubic-bezier(0.16, 1, 0.3, 1);
  }
}
@keyframes pulse-ab-v {
  0% { top: 0; opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { top: calc(100% - 8px); opacity: 0; }
}
@keyframes pulse-ba-v {
  0% { top: calc(100% - 8px); opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { top: 0; opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .sd-cell,
  .sd-clear {
    transition: none;
  }
  .sd-wire-pulse,
  .sd-live-dot {
    animation: none;
  }
  /* No traveling pulse; show a steady receiving-end marker instead. */
  .sd-wire.flow-ab .sd-wire-pulse,
  .sd-wire.flow-ba .sd-wire-pulse {
    opacity: 1;
    animation: none;
  }
}
</style>
