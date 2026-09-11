import Foundation
import React
#if canImport(ActivityKit)
import ActivityKit
#endif

// ─── Dynamic Island countdown bridge (ActivityKit, iOS 16.1+) ────────────────
// Starts/ends a Live Activity that counts down to a meeting's start in the
// Dynamic Island. The island UI itself is rendered by the widget extension
// (RoyceMeetingWidget) using RoyceMeetingAttributes — this module just requests
// and ends the activity. Exposed to React Native as `MeetingLiveActivityModule`.
//
// JS wrapper: src/features/meetings/liveActivity.ts.

@objc(MeetingLiveActivityModule)
class MeetingLiveActivityModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  private static let iso: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  @objc(isEnabled:rejecter:)
  func isEnabled(_ resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    #if canImport(ActivityKit)
    if #available(iOS 16.1, *) {
      resolve(ActivityAuthorizationInfo().areActivitiesEnabled)
      return
    }
    #endif
    resolve(false)
  }

  // payload: { id, title, startISO }
  @objc(startCountdown:resolver:rejecter:)
  func startCountdown(_ payload: NSDictionary,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    #if canImport(ActivityKit)
    if #available(iOS 16.1, *) {
      guard
        let id = payload["id"] as? String,
        let title = payload["title"] as? String,
        let startISO = payload["startISO"] as? String,
        let start = MeetingLiveActivityModule.iso.date(from: startISO)
      else {
        reject("bad_payload", "Missing live-activity fields", nil)
        return
      }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        resolve(nil) // user disabled Live Activities — nothing to do
        return
      }
      Task {
        // One meeting countdown at a time: end any existing one first.
        for activity in Activity<RoyceMeetingAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        let attributes = RoyceMeetingAttributes(meetingId: id)
        let state = RoyceMeetingAttributes.ContentState(meetingStart: start, title: title)
        do {
          if #available(iOS 16.2, *) {
            _ = try Activity.request(
              attributes: attributes,
              content: .init(state: state, staleDate: start),
              pushType: nil,
            )
          } else {
            _ = try Activity.request(attributes: attributes, contentState: state, pushType: nil)
          }
          resolve(nil)
        } catch {
          reject("activity_error", error.localizedDescription, error)
        }
      }
      return
    }
    #endif
    resolve(nil)
  }

  @objc(endAll:rejecter:)
  func endAll(_ resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
    #if canImport(ActivityKit)
    if #available(iOS 16.1, *) {
      Task {
        for activity in Activity<RoyceMeetingAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        resolve(nil)
      }
      return
    }
    #endif
    resolve(nil)
  }
}
