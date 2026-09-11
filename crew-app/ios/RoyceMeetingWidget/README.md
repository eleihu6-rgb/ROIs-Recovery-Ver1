# RoyceMeetingWidget — Dynamic Island meeting countdown

The Dynamic Island live countdown (Profile → Meetings → "Dynamic Island
countdown") needs a **Widget Extension target**. ActivityKit's
`ActivityConfiguration` can only be rendered from a widget extension, not the app
target — so these files must be wired into a new target in Xcode (a GUI step;
can't be scripted headlessly). Everything else (the JS, the app-side
`MeetingLiveActivityModule`, the Profile option, the alarm) already works without
this; only the visible island countdown depends on it.

## One-time Xcode wiring

1. Open `ios/RoyceTravelTemplate.xcworkspace`.
2. **File → New → Target… → Widget Extension.**
   - Product name: `RoyceMeetingWidget`
   - ✅ **Include Live Activity**
   - Uncheck "Include Configuration Intent".
3. Delete the boilerplate files Xcode generates in the new target and instead add
   the files in this folder to the `RoyceMeetingWidget` target:
   - `RoyceMeetingWidgetBundle.swift`
   - `RoyceMeetingLiveActivity.swift`
4. Add the shared attributes file to **both** targets (app + widget):
   - `RoyceTravelTemplate/RoyceMeetingAttributes.swift` → check both
     "RoyceTravelTemplate" and "RoyceMeetingWidget" in its File Inspector →
     Target Membership.
5. Confirm the app target's `Info.plist` has `NSSupportsLiveActivities = YES`
   (already added).
6. Build & run on a device (Dynamic Island needs an iPhone 14 Pro or newer; the
   countdown also shows on the Lock Screen on other models).

## How it starts

`src/features/meetings/meetingsSlice.ts → syncIslandCountdown()` calls the native
`startCountdown` for the next meeting once it's within the configured lead time
(default 5 min). This runs on app launch, on foreground sync, and after a roster/
calendar refresh. Starting it precisely while the app is fully closed is bounded
by the same iOS background limits as the meeting alarms (see
`MeetingBackgroundSync`); to also start it from the background, call the same
ActivityKit request from the BGTask handler, or use push-to-start Live Activities
(needs a backend + APNs).
