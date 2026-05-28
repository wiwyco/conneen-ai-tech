# Zoom Scout Voice Assistant Test - 2026-05-27T21:28:58.281Z

## Meeting

- Client: Northstar Family Dental
- Meeting ID: e19b9636-3694-48c4-8e3b-f3e148eaf9e0
- Provider: zoom
- Join URL: https://us04web.zoom.us/j/79132364217?pwd=rIbXbaGo4Urxfd6WLGlCeuvs1ByjQI.1
- Scout bot opened: yes
- Scout bot page: http://localhost:4321/zoom-scout-bot?eventId=e19b9636-3694-48c4-8e3b-f3e148eaf9e0&clientId=68645f24-dab4-452b-9027-e541ec20dd49&meetingNumber=79132364217&password=Wtk4pK&secret=[hidden]&name=Scout&autoJoin=true&chatEcho=true&sdkVersion=4.0.0
- Scout latest response delivery: voice
- Scout response count: 0

## Visible Bot Notes

The browser bot page joins the Zoom meeting as Scout using the Zoom Meeting SDK. Zoom chat events are relayed into Scout's meeting brain when the SDK exposes chat events in this browser build. Scout can post chat responses back when the SDK exposes sendChat.

Browser text-to-speech plays locally from the bot page. To make that audio audible inside Zoom, route the browser output into a virtual microphone device and select that device as Scout's microphone in the bot meeting window.

## Test Log


