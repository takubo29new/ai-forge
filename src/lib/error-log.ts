import { prisma } from "@/lib/prisma";

const MAX_TEXT_LENGTH = 4000;

function truncate(value: string | undefined | null, max = MAX_TEXT_LENGTH) {
  if (value === undefined || value === null || value.length === 0) return null;
  return value.length > max ? value.slice(0, max) : value;
}

export async function logError(input: {
  source: "SERVER" | "CLIENT";
  message: string;
  digest?: string | null;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  userId?: string | null;
}) {
  try {
    await prisma.errorLog.create({
      data: {
        source: input.source,
        message: truncate(input.message) ?? "(no message)",
        digest: input.digest ?? null,
        stack: truncate(input.stack),
        path: input.path ?? null,
        method: input.method ?? null,
        userId: input.userId ?? null,
      },
    });
  } catch (dbError) {
    console.error("failed to persist error log", dbError);
  }
}
