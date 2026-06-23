import { defineConfig } from "vitepress";
import llmstxt, { copyOrDownloadAsMarkdownButtons } from "vitepress-plugin-llms";
import typedocSidebar from "../reference/typedoc-sidebar.json";

export default defineConfig({
  title: "super-store",
  description:
    "A reactive store primitive backed by a Yjs CRDT — local, real-time collaborative, persistent and undoable behind one in-memory-style API.",
  base: "/super-store/",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: "localhostLinks",
  head: [["link", { rel: "icon", href: "/super-store/mark.svg" }]],
  markdown: {
    config(md) {
      md.use(copyOrDownloadAsMarkdownButtons);
    },
  },
  vite: {
    plugins: [llmstxt({ domain: "https://mertdogar.github.io" })],
  },
  themeConfig: {
    logo: "/mark.svg",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/" },
      { text: "Examples", link: "/examples/" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Why super-store", link: "/guide/introduction" },
            { text: "Getting started", link: "/guide/getting-started" },
          ],
        },
        {
          text: "Core",
          items: [
            { text: "StoreValue & the two modes", link: "/guide/store-value" },
            { text: "Reactivity", link: "/guide/reactivity" },
            { text: "Writes: set & update", link: "/guide/writes" },
            { text: "Type mapping", link: "/guide/type-mapping" },
          ],
        },
        {
          text: "Realtime & history",
          items: [
            { text: "Collaboration & persistence", link: "/guide/collaboration" },
            { text: "Undo / redo", link: "/guide/undo" },
          ],
        },
        {
          text: "React",
          items: [{ text: "useStore & useStoreSelector", link: "/guide/react" }],
        },
        {
          text: "More",
          items: [
            { text: "Use with your AI agent", link: "/guide/ai-agents" },
            { text: "Comparison & FAQ", link: "/guide/comparison-faq" },
          ],
        },
      ],
      "/reference/": [{ text: "Packages", items: typedocSidebar }],
    },
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/mertdogar/super-store" }],
    editLink: {
      pattern: "https://github.com/mertdogar/super-store/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Mert",
    },
  },
});
