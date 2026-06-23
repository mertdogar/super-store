---
layout: home
title: A reactive store, quietly backed by a CRDT
titleTemplate: super-store
hero:
  name: super-store
  text: A reactive store, quietly backed by a CRDT
  tagline: Write it like in-memory state. Get real-time collaboration, offline persistence, and undo/redo — opt-in, behind the same API.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Why super-store
      link: /guide/introduction
    - theme: alt
      text: GitHub
      link: https://github.com/mertdogar/super-store
features:
  - title: One API, two modes
    details: A StoreValue is a plain in-memory value until it isn't. Bind a doc and the same handle becomes a CRDT — reads stay synchronous, writes stay a method call.
  - title: Real CRDT merge
    details: Backed by Yjs. Concurrent edits converge — per field, per array slot, per set member — so two people editing the same thing both win.
  - title: Collaboration without importing Yjs
    details: encodeState / applyUpdate / onUpdate move CRDT bytes over any transport you own. The wire is a CRDT; your code never sees Y.*.
  - title: Tear-free React
    details: useStore and useStoreSelector wrap useSyncExternalStore with a cached, reference-stable snapshot. A remote merge re-renders exactly like a local set.
  - title: Undo that respects peers
    details: Opt-in per root. Only your own edits revert; a remote merge is never undone; an undo propagates to peers like any edit.
  - title: Diff-and-patch writes
    details: set() never clear-and-rewrites — it diffs and patches inside one transaction, so the document stays small and concurrent edits merge.
---
