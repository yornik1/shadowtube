import { dlog } from "@/src/utils/devLog";

/** Machine-readable события для log-driven E2E (`GET /log/tail`). */
export function e2eEvent(
  event: string,
  data: Record<string, unknown> = {},
): void {
  dlog("e2e", JSON.stringify({ event, ...data }));
}
