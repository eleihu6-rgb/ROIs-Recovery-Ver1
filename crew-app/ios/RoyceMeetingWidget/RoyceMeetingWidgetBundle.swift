import WidgetKit
import SwiftUI

// Widget bundle entry point for the RoyceMeetingWidget extension. Hosts the
// meeting Live Activity (Dynamic Island countdown). Add more widgets here later.

@main
struct RoyceMeetingWidgetBundle: WidgetBundle {
  var body: some Widget {
    RoyceMeetingLiveActivity()
  }
}
