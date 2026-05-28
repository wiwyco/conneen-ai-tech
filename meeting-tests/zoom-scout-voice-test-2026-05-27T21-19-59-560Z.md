# Zoom Scout Voice Assistant Test - 2026-05-27T21:19:59.559Z

## Meeting

- Client: Northstar Family Dental
- Meeting ID: 1adf1918-fbe5-4c5b-a342-4147abdfe06e
- Provider: zoom
- Join URL: https://us04web.zoom.us/j/73964011202?pwd=xOtwmMfXmtzSUR1ZGBV4SY5slfCbfn.1
- Scout bot opened: yes
- Scout bot page: http://localhost:4321/zoom-scout-bot?eventId=1adf1918-fbe5-4c5b-a342-4147abdfe06e&clientId=68645f24-dab4-452b-9027-e541ec20dd49&meetingNumber=73964011202&password=9s3xkN&secret=[hidden]&name=Scout&autoJoin=true&chatEcho=true
- Scout latest response delivery: voice
- Scout response count: 0

## Visible Bot Notes

The browser bot page joins the Zoom meeting as Scout using the Zoom Meeting SDK. Zoom chat events are relayed into Scout's meeting brain when the SDK exposes chat events in this browser build. Scout can post chat responses back when the SDK exposes sendChat.

Browser text-to-speech plays locally from the bot page. To make that audio audible inside Zoom, route the browser output into a virtual microphone device and select that device as Scout's microphone in the bot meeting window.

## Test Log


