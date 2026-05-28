# Scout Zoom Production Voice Bot

Scout currently has a browser Meeting SDK test participant. That is useful for visibility, chat relay, and local speech testing, but it is not the full production audio path.

The production design needs two media paths:

1. **Hearing Zoom participants:** Zoom RTMS receives live Zoom meeting transcript/audio with speaker attribution.
2. **Speaking as Scout:** a native Zoom Meeting SDK bot injects Scout's generated audio into the meeting as Scout's microphone.

## Current Implementation

- `/api/portal/meeting-scout` is the meeting brain. It stores transcript, notes, takeaways, live responses, and stop/interruption state.
- `/api/portal/scout-voice` generates smoother Scout speech audio with OpenAI TTS.
- `npm run scout:voice-options` generates sample voice files in `scout-voice-options/`.
- `npm run scout:rtms` starts a standalone RTMS webhook/listener. Zoom's RTMS npm package does not support Windows, so run it on Linux/macOS.
- `scout-audio-outbox/` is the handoff folder for a native Zoom audio sender. Each JSON file contains a Scout response that should be synthesized and sent into Zoom.
- The browser Scout bot polls `/api/portal/meeting-scout` and speaks new responses using `/api/portal/scout-voice`, so an RTMS transcript can drive the visible Scout participant.

## Voice Recommendation

Start with:

- `marin`: default for client meetings; warm and natural.
- `cedar`: calmer, executive, high-trust.
- `verse`: more responsive and conversational.
- `sage`: patient and gentle for longer explanations.
- `coral`: polished and bright for onboarding.

Generate local samples:

```bash
npm run scout:voice-options
```

Set the default:

```env
SCOUT_TTS_MODEL=gpt-4o-mini-tts
SCOUT_TTS_VOICE=marin
```

OpenAI requires clear disclosure to end users that the voice is AI-generated.

## RTMS Setup

Zoom RTMS is the supported path for AI meeting listening/transcription. Add RTMS to a Zoom General App and configure:

- RTMS started/stopped webhook events
- RTMS transcript and/or audio scopes
- Webhook endpoint pointing to the public URL of `npm run scout:rtms`

For local testing:

```bash
npm run scout:rtms
```

Expose it:

```bash
ngrok http 8787
```

Then set the Zoom webhook URL to:

```txt
https://YOUR-NGROK-DOMAIN/webhook-or-root
```

The listener handles Zoom `endpoint.url_validation` and `meeting.rtms_started` events.

## Windows Local Workaround

Zoom's RTMS npm package does not install on Windows. To run the full local test from a Windows laptop:

1. Install WSL2 with Ubuntu.
2. In Ubuntu, open the repo through `/mnt/c/...`.
3. Run `npm install --no-save @zoom/rtms` inside Ubuntu.
4. Run `npm run scout:rtms` inside Ubuntu.
5. Run `npm run dev` and `npm run test:zoom-scout-voice` from Windows.
6. Install a virtual audio cable on Windows.
7. Route the Scout browser tab output to the virtual cable playback device.
8. In Scout's embedded Zoom window, select the virtual cable recording device as Scout's microphone and unmute Scout.

At that point, RTMS supplies what Scout hears, the browser Scout page supplies OpenAI TTS speech, and the virtual audio cable makes that speech audible to other Zoom participants.

Environment:

```env
ZOOM_WEBHOOK_SECRET_TOKEN=...
SCOUT_MEETING_WEBHOOK_SECRET=...
SCOUT_RTMS_PORT=8787
SCOUT_RTMS_PORTAL_BASE_URL=http://localhost:4321
SCOUT_RTMS_EVENT_ID=portal_calendar_events id for the test meeting
SCOUT_RTMS_CLIENT_ID=portal client id for the test meeting
```

For production, replace `SCOUT_RTMS_EVENT_ID` and `SCOUT_RTMS_CLIENT_ID` with a database lookup from Zoom meeting UUID/meeting ID to the portal calendar event.

## Speaking Into Zoom

The browser Meeting SDK cannot reliably inject arbitrary generated audio as Scout's microphone. The production path is a native Meeting SDK process:

- Join the Zoom meeting as Scout.
- Use Zoom native Meeting SDK raw audio / virtual mic APIs.
- Watch `scout-audio-outbox/` or subscribe to a queue.
- Synthesize Scout TTS as PCM/WAV.
- Send PCM frames into Zoom as Scout's microphone.
- Stop sending immediately when:
  - RTMS transcript contains "that's enough Scout" / "stop Scout"
  - RTMS detects another non-Scout speaker while Scout is talking
  - the meeting brain returns `stopRequested`

Windows and Linux native SDKs require downloading SDK files from Zoom App Marketplace; those files are not distributed by npm and are not checked into this repo.

## Useful References

- Zoom RTMS overview: https://developers.zoom.us/docs/rtms/
- Zoom RTMS meetings getting started: https://developers.zoom.us/docs/rtms/meetings/getting-started/
- Zoom RTMS media handling: https://developers.zoom.us/docs/rtms/meetings/media/
- Zoom Meeting SDK overview: https://developers.zoom.us/docs/meeting-sdk/
- OpenAI Text to Speech: https://platform.openai.com/docs/guides/text-to-speech
