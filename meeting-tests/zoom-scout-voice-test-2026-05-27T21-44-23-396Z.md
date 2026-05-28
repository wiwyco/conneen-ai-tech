# Zoom Scout Voice Assistant Test - 2026-05-27T21:44:23.396Z

## Meeting

- Client: Northstar Family Dental
- Meeting ID: 817b0ad4-061d-4b61-9e40-22d70306e1ee
- Provider: zoom
- Join URL: https://us04web.zoom.us/j/77732566477?pwd=fS0JWSLdA1BGym6BvF3imjxVdB34zc.1
- Scout bot opened: yes
- Scout bot page: http://localhost:4321/zoom-scout-bot?eventId=817b0ad4-061d-4b61-9e40-22d70306e1ee&clientId=68645f24-dab4-452b-9027-e541ec20dd49&meetingNumber=77732566477&password=VkrFd5&secret=[hidden]&secretHash=6bcdac7dee&name=Scout&autoJoin=true&chatEcho=true&sdkVersion=4.0.0
- Scout latest response delivery: voice
- Scout response count: 0

## Visible Bot Notes

The browser bot page joins the Zoom meeting as Scout using the Zoom Meeting SDK. Zoom chat events are relayed into Scout's meeting brain when the SDK exposes chat events in this browser build. Scout can post chat responses back when the SDK exposes sendChat.

Browser text-to-speech plays locally from the bot page. To make that audio audible inside Zoom, route the browser output into a virtual microphone device and select that device as Scout's microphone in the bot meeting window.

## Test Log


