import { db } from "@/lib/db";
import { ok, requireUser } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const take = Math.min(50, Number(url.searchParams.get("take") || 10));
  const logs = await db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take });
  return ok({ activities: logs });
}
