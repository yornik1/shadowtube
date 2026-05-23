/**
 * Web stub for the SQLite client.
 *
 * All web screens render <AndroidOnly /> so getDb() is never actually
 * called at runtime on web.  This file exists solely to prevent
 * expo-sqlite (which pulls in wa-sqlite.wasm) from being included in
 * the web / Expo-Router SSR bundle — Metro resolves client.web.ts
 * instead of client.native.ts when building for the web platform.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

export function getDb(): AnyDb {
  throw new Error(
    "SQLite is not available on web. Open the app on Android.",
  );
}

export const db: AnyDb = new Proxy(
  {},
  {
    get() {
      return getDb();
    },
  },
);

export type Database = AnyDb;
