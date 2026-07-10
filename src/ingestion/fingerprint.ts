import { createHash } from "node:crypto";










export function computeFingerprint(handler: string, errorType: string): string {
  const material = `${handler}\0${errorType}`;
  return createHash("sha256").update(material, "utf-8").digest("hex");
}
