import { getEnv } from "./env";

type CreateMeetingInput = {
  title: string;
  startTime: string;
  durationMinutes: number;
  notes?: string;
};

export type OnlineMeeting = {
  provider: string;
  providerId: string | null;
  joinUrl: string;
  password: string | null;
  instructions: string;
};

function fallbackMeeting(reason: string): OnlineMeeting {
  const fallbackUrl = getEnv("PUBLIC_MEETING_FALLBACK_URL") || getEnv("MEETING_FALLBACK_URL") || "";
  return {
    provider: "manual",
    providerId: null,
    joinUrl: fallbackUrl,
    password: null,
    instructions: fallbackUrl
      ? "A fallback meeting link was attached because the meeting provider is not fully configured."
      : `No online meeting link was created yet. ${reason}`,
  };
}

async function zoomAccessToken() {
  const accountId = getEnv("ZOOM_ACCOUNT_ID");
  const clientId = getEnv("ZOOM_CLIENT_ID");
  const clientSecret = getEnv("ZOOM_CLIENT_SECRET");
  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom is missing ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, or ZOOM_CLIENT_SECRET.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const detail = [data.error, data.reason, data.message, data.code ? `code ${data.code}` : ""]
      .filter(Boolean)
      .join(" - ");
    throw new Error(detail || `Zoom did not return an access token. HTTP ${response.status}`);
  }
  return String(data.access_token);
}

async function createZoomMeeting(input: CreateMeetingInput): Promise<OnlineMeeting> {
  const token = await zoomAccessToken();
  const userId = encodeURIComponent(getEnv("ZOOM_USER_ID") || "me");
  const waitingRoom = getEnv("ZOOM_WAITING_ROOM") === "false" ? false : true;
  const joinBeforeHost = getEnv("ZOOM_JOIN_BEFORE_HOST") === "true";
  const response = await fetch(`https://api.zoom.us/v2/users/${userId}/meetings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: input.title,
      type: 2,
      start_time: input.startTime,
      duration: input.durationMinutes,
      timezone: "UTC",
      agenda: input.notes || "",
      settings: {
        join_before_host: joinBeforeHost,
        waiting_room: waitingRoom,
        meeting_authentication: false,
        mute_upon_entry: true,
        auto_recording: getEnv("ZOOM_AUTO_RECORDING") || "none",
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.join_url) {
    throw new Error(data.message || "Zoom could not create the meeting.");
  }

  return {
    provider: "zoom",
    providerId: String(data.id || ""),
    joinUrl: String(data.join_url || ""),
    password: data.password ? String(data.password) : null,
    instructions: waitingRoom
      ? "Join with the Zoom link. Waiting room is enabled, and Scout will prepare live notes when transcript updates are available."
      : "Join with the Zoom link. Scout will prepare live notes when transcript updates are available.",
  };
}

export async function createOnlineMeeting(input: CreateMeetingInput): Promise<OnlineMeeting> {
  const provider = (getEnv("MEETING_PROVIDER") || "zoom").toLowerCase();

  if (provider === "none" || provider === "manual") {
    return fallbackMeeting("Set MEETING_PROVIDER=zoom and add Zoom server-to-server OAuth credentials to create links automatically.");
  }

  if (provider !== "zoom") {
    return fallbackMeeting(`Unsupported MEETING_PROVIDER "${provider}". Zoom is the implemented provider.`);
  }

  try {
    return await createZoomMeeting(input);
  } catch (error) {
    if (getEnv("MEETING_PROVIDER_REQUIRED") === "true") throw error;
    const reason = error instanceof Error ? error.message : "Zoom could not create the meeting.";
    return fallbackMeeting(reason);
  }
}
