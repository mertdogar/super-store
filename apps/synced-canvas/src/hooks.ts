import { createSuperLineHooks } from "@super-line/react";
import type { canvas } from "./contract";

// One hooks instance shared by App.tsx and the sync layer so they wire to the
// same client/provider.
export const { Provider, useRequest, useEvent } = createSuperLineHooks<typeof canvas, "user">();
