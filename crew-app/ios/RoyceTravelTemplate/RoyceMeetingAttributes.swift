import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

// ─── Live Activity attributes for the meeting countdown ──────────────────────
// Shared between the app target (which starts/ends the activity via
// MeetingLiveActivityModule) and the widget extension (which renders the Dynamic
// Island countdown). Add this file to BOTH targets in Xcode.

#if canImport(ActivityKit)
struct RoyceMeetingAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// Absolute start instant of the meeting; the island counts down to this.
    var meetingStart: Date
    /// Meeting subject shown beside the countdown.
    var title: String
  }

  /// Stable meeting id (EventKit eventIdentifier) — one activity per meeting.
  var meetingId: String
}
#endif
