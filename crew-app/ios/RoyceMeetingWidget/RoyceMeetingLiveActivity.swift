import ActivityKit
import WidgetKit
import SwiftUI

// ─── Dynamic Island countdown UI ─────────────────────────────────────────────
// Renders the meeting countdown in the Dynamic Island + Lock Screen. The native
// countdown uses Text(timerInterval:) so iOS ticks it down to the meeting start
// with no updates from the app. Started/ended by MeetingLiveActivityModule.
//
// Lives in the RoyceMeetingWidget extension target (see README.md). The shared
// RoyceMeetingAttributes.swift must be a member of this target too.

struct RoyceMeetingLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RoyceMeetingAttributes.self) { context in
      // Lock Screen / banner presentation.
      HStack(spacing: 12) {
        Image(systemName: "person.2.fill")
          .foregroundStyle(.purple)
        VStack(alignment: .leading, spacing: 2) {
          Text(context.state.title)
            .font(.headline)
            .lineLimit(1)
          Text(timerInterval: Date()...context.state.meetingStart, countsDown: true)
            .font(.subheadline)
            .monospacedDigit()
            .foregroundStyle(.secondary)
        }
        Spacer()
      }
      .padding()
      .activityBackgroundTint(Color.black.opacity(0.4))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "person.2.fill").foregroundStyle(.purple)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(timerInterval: Date()...context.state.meetingStart, countsDown: true)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
            .frame(width: 56)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(context.state.title).font(.caption).lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text("Meeting starting soon").font(.caption2).foregroundStyle(.secondary)
        }
      } compactLeading: {
        Image(systemName: "person.2.fill").foregroundStyle(.purple)
      } compactTrailing: {
        Text(timerInterval: Date()...context.state.meetingStart, countsDown: true)
          .monospacedDigit()
          .frame(width: 44)
      } minimal: {
        Image(systemName: "person.2.fill").foregroundStyle(.purple)
      }
    }
  }
}
