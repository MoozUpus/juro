import type { BuilderRuntimeEnv } from "../document-builder/storage/runtime";

export type LawyerCallRole = "client" | "lawyer";
export type LawyerCallParticipant = {
  consultationId: string;
  consultationStatus: "proposed" | "confirmed" | "in_progress" | "completed" | "cancelled";
  format: "video" | "phone" | "office";
  startsAt: string;
  endsAt: string;
  requestId: string;
  workspaceId: string;
  caseId: string;
  lawyerUserId: string;
  clientUserId: string;
  lawyerName: string;
  clientName: string;
  role: LawyerCallRole;
  otherUserId: string;
};

export type BrowserIceServer = { urls: string | string[]; username?: string; credential?: string };

export async function lawyerCallParticipant(
  db: D1Database,
  consultationId: string,
  userId: string,
): Promise<LawyerCallParticipant | null> {
  const row = await db.prepare(
    `SELECT c.id AS consultationId,c.status AS consultationStatus,c.format,c.starts_at AS startsAt,
      c.ends_at AS endsAt,c.lawyer_request_id AS requestId,r.workspace_id AS workspaceId,c.case_id AS caseId,
      p.user_id AS lawyerUserId,c.client_user_id AS clientUserId,p.display_name AS lawyerName,
      client.full_name AS clientName
     FROM lawyer_consultations c
     JOIN lawyer_requests r ON r.id=c.lawyer_request_id
     JOIN lawyer_profiles p ON p.id=c.lawyer_profile_id
     JOIN user_profiles client ON client.id=c.client_user_id
     WHERE c.id=? AND (p.user_id=? OR c.client_user_id=?) LIMIT 1`,
  ).bind(consultationId, userId, userId).first<Omit<LawyerCallParticipant, "role" | "otherUserId">>();
  if (!row) return null;
  const role: LawyerCallRole = row.lawyerUserId === userId ? "lawyer" : "client";
  return { ...row, role, otherUserId: role === "lawyer" ? row.clientUserId : row.lawyerUserId };
}

function safeIceServers(value: unknown): BrowserIceServer[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as { urls?: unknown; username?: unknown; credential?: unknown };
    const urls = (Array.isArray(item.urls) ? item.urls : [item.urls])
      .filter((url): url is string => typeof url === "string" && /^(?:stun|turn|turns):/.test(url))
      // Cloudflare documents that port 53 is blocked by Chrome. Keep trickle ICE fast.
      .filter((url) => !/:53(?:\?|$)/.test(url))
      .slice(0, 12);
    if (!urls.length) return [];
    return [{
      urls,
      ...(typeof item.username === "string" ? { username: item.username.slice(0, 512) } : {}),
      ...(typeof item.credential === "string" ? { credential: item.credential.slice(0, 512) } : {}),
    }];
  });
}

export async function generateLawyerCallIceServers(
  env: Pick<BuilderRuntimeEnv, "CLOUDFLARE_TURN_KEY_ID" | "CLOUDFLARE_TURN_KEY_API_TOKEN">,
  fetcher: typeof fetch = fetch,
): Promise<{ iceServers: BrowserIceServer[]; relayAvailable: boolean; provider: "cloudflare_realtime_turn" | "cloudflare_stun_only" }> {
  const fallback = {
    iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
    relayAvailable: false,
    provider: "cloudflare_stun_only" as const,
  };
  if (!env.CLOUDFLARE_TURN_KEY_ID || !env.CLOUDFLARE_TURN_KEY_API_TOKEN) return fallback;
  try {
    const response = await fetcher(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${env.CLOUDFLARE_TURN_KEY_API_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl: 7_200 }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return fallback;
    const payload = await response.json() as { iceServers?: unknown };
    const iceServers = safeIceServers(payload.iceServers);
    const relayAvailable = iceServers.some((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => /^turns?:/.test(url)));
    return relayAvailable ? { iceServers, relayAvailable: true, provider: "cloudflare_realtime_turn" } : fallback;
  } catch {
    return fallback;
  }
}
