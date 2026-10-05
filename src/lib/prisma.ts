import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Resilient database query executor with automatic retry for serverless cold-starts
 * and transient idle connection drops.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 600): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const anyErr = err as { code?: string; name?: string; message?: string };
      const isTransient =
        anyErr?.code === "P1001" ||
        anyErr?.code === "P1002" ||
        anyErr?.code === "P1008" ||
        anyErr?.code === "P1017" ||
        anyErr?.name === "PrismaClientInitializationError" ||
        (typeof anyErr?.message === "string" &&
          (anyErr.message.includes("Can't reach database") ||
            anyErr.message.includes("Connection terminated") ||
            anyErr.message.includes("closed the connection") ||
            anyErr.message.includes("timed out") ||
            anyErr.message.includes("ECONNRESET") ||
            anyErr.message.includes("ETIMEDOUT")));

      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      // Wait briefly before retrying so Neon compute can complete wake-up
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}
