/**
 * TypeScript entry-point for the DB client.
 *
 * tsc resolves this file; Metro prefers platform-specific variants:
 *   client.native.ts  — Android/iOS (expo-sqlite)
 *   client.web.ts     — web (in-memory stub)
 *
 * This file is never executed at runtime — it only provides types.
 */
export { getDb, db } from "./client.native";
export type { Database } from "./client.native";
