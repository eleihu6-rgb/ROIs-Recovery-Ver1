# Crew App iOS Scene Lifecycle

## Scope

Replace the iOS 27 workaround that starts React Native in `RCTAppDelegate` and then moves its mounted root view into a scene window. A dedicated `SceneDelegate` must own the window and start React Native there from the beginning.

## Design

- `AppDelegate` remains responsible for application-level startup: publishing build-configured API defaults and registering/scheduling background refresh.
- `SceneDelegate` owns the `UIWindow`, `RCTReactNativeFactory`, React Native bundle URL, scene deep-link forwarding, and background re-scheduling.
- On RN 0.86, scene URL/user-activity connection options are translated to legacy application launch options so `Linking.getInitialURL()` remains functional.
- The change stays on RN 0.86.3. RN 0.88 does not clear the production audit and requires a Node version outside this machine's supported runtime.

## Risks

- Incorrect Xcode source membership would compile without the delegate implementation and fail at launch.
- Starting React Native before attaching the window to `UIWindowScene` would reproduce the blank/crashing launch.
- Dropping scene deep-link forwarding would regress the `rbot://` URL flow.

## Verification

- Jest contract test proves the dedicated delegate configuration and rejects the root-view re-home workaround.
- TypeScript and focused Crew App tests remain green.
- Release simulator build must launch into rendered app UI without the `RCTEventEmitter.receiveEvent()` exception.
- Real-UI validation proceeds in order: iPhone Air, iPhone Duo — Test, iPad, with versioned screenshots.
