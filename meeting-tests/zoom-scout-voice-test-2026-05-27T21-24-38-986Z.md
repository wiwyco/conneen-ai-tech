# Zoom Scout Voice Assistant Test - 2026-05-27T21:24:38.985Z

## Meeting

- Client: Northstar Family Dental
- Meeting ID: 35dc68ea-aa7c-45c7-927f-fcfe54628ee6
- Provider: zoom
- Join URL: https://us04web.zoom.us/j/73215612968?pwd=cdL5Lp3NZIgbFBDvayjYHvj2LpBU0A.1
- Scout bot opened: yes
- Scout bot page: http://localhost:4321/zoom-scout-bot?eventId=35dc68ea-aa7c-45c7-927f-fcfe54628ee6&clientId=68645f24-dab4-452b-9027-e541ec20dd49&meetingNumber=73215612968&password=kZv0w2&secret=[hidden]&name=Scout&autoJoin=true&chatEcho=true&sdkVersion=4.0.0
- Scout latest response delivery: voice
- Scout response count: 0

## Visible Bot Notes

The browser bot page joins the Zoom meeting as Scout using the Zoom Meeting SDK. Zoom chat events are relayed into Scout's meeting brain when the SDK exposes chat events in this browser build. Scout can post chat responses back when the SDK exposes sendChat.

Browser text-to-speech plays locally from the bot page. To make that audio audible inside Zoom, route the browser output into a virtual microphone device and select that device as Scout's microphone in the bot meeting window.

## Test Log


