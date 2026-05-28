# Zoom Scout Voice Assistant Test - 2026-05-27T21:31:40.585Z

## Meeting

- Client: Northstar Family Dental
- Meeting ID: b458af4f-25f6-4ff6-9f02-e1671ef63626
- Provider: zoom
- Join URL: https://us04web.zoom.us/j/71800412337?pwd=i3fBvNmlJ3mW8dJcsF9M1WXszyazFc.1
- Scout bot opened: yes
- Scout bot page: http://localhost:4321/zoom-scout-bot?eventId=b458af4f-25f6-4ff6-9f02-e1671ef63626&clientId=68645f24-dab4-452b-9027-e541ec20dd49&meetingNumber=71800412337&password=9HrchK&secret=[hidden]&name=Scout&autoJoin=true&chatEcho=true&sdkVersion=4.0.0
- Scout latest response delivery: voice
- Scout response count: 0

## Visible Bot Notes

The browser bot page joins the Zoom meeting as Scout using the Zoom Meeting SDK. Zoom chat events are relayed into Scout's meeting brain when the SDK exposes chat events in this browser build. Scout can post chat responses back when the SDK exposes sendChat.

Browser text-to-speech plays locally from the bot page. To make that audio audible inside Zoom, route the browser output into a virtual microphone device and select that device as Scout's microphone in the bot meeting window.

## Test Log


