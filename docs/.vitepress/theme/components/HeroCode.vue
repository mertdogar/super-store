<script setup lang="ts">
// The hero showpiece: "plain state until it isn't." Two stages, one handle.
// Static, hand-tokenized so it stays light and on-brand (The Quiet Instrument).
</script>

<template>
  <div class="hero-code" aria-hidden="false">
    <div class="hc-chrome">
      <span class="hc-dot" /><span class="hc-dot" /><span class="hc-dot" />
      <span class="hc-file">counter.ts</span>
    </div>
    <pre class="hc-body"><code><span class="k">import</span> { <span class="ty">StoreValue</span> } <span class="k">from</span> <span class="s">"@super-store/store"</span>

<span class="c">// Local — identical to an in-memory store:</span>
<span class="k">const</span> counter = <span class="k">new</span> <span class="ty">StoreValue</span>(<span class="n">0</span>)
counter.<span class="fn">subscribe</span>(() => <span class="fn">render</span>(counter.<span class="fn">getSnapshot</span>()))
counter.<span class="fn">set</span>(<span class="n">1</span>)  <span class="c">// renders 1</span>

<span class="c">// Collaborative — same handle, opt-in:</span>
counter.<span class="fn">onUpdate</span>((u, { local }) => local && bus.<span class="fn">send</span>(u))
bus.<span class="fn">on</span>(<span class="s">"message"</span>, (u) => counter.<span class="fn">applyUpdate</span>(u))</code></pre>
    <div class="hc-foot">
      <span class="hc-pill">local</span>
      <span class="hc-arrow">→</span>
      <span class="hc-pill hc-pill-live">collaborative</span>
      <span class="hc-note">no <code>yjs</code> import</span>
    </div>
  </div>
</template>

<style scoped>
.hero-code {
  width: 100%;
  max-width: 480px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-alt);
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 12px 32px rgba(124, 58, 237, 0.08);
  font-variant-ligatures: none;
}

.hc-chrome {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.hc-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--vp-c-gray-3);
}
.hc-file {
  margin-left: 8px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.hc-body {
  margin: 0;
  padding: 18px 20px;
  overflow-x: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--vp-c-text-1);
  white-space: pre;
  -webkit-overflow-scrolling: touch;
}
.hc-body code {
  font-family: inherit;
  background: none;
  padding: 0;
}

/* Restrained tokenization: brand violet is the one signal (keywords + types),
   comments recede, everything else is ink. No rainbow — The Quiet Instrument. */
.hc-body .k { color: var(--vp-c-brand-1); font-weight: 500; }
.hc-body .ty { color: var(--vp-c-brand-1); }
.hc-body .fn { color: var(--vp-c-text-1); font-weight: 500; }
.hc-body .s { color: var(--vp-c-text-2); }
.hc-body .n { color: var(--vp-c-text-2); }
.hc-body .c { color: var(--vp-c-text-3, var(--vp-c-text-2)); font-style: italic; }

.hc-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 12px;
}
.hc-pill {
  padding: 3px 10px;
  border-radius: 20px;
  background: var(--vp-c-gray-soft);
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
}
.hc-pill-live {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
.hc-arrow { color: var(--vp-c-text-3, var(--vp-c-text-2)); }
.hc-note {
  margin-left: auto;
  color: var(--vp-c-text-2);
}
.hc-note code {
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  background: var(--vp-c-gray-soft);
  padding: 1px 5px;
  border-radius: 4px;
}

@media (max-width: 639px) {
  .hero-code { max-width: 100%; }
  .hc-body { font-size: 12.5px; }
}
</style>
