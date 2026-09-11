import Foundation
import BackgroundTasks
import EventKit
import CryptoKit
#if canImport(AlarmKit)
import AlarmKit
#endif
#if canImport(SwiftUI)
import SwiftUI
#endif

// ─── Background meeting refresh (BGTaskScheduler) ─────────────────────────────
// Wakes the app periodically (best-effort, iOS-scheduled) to re-read the device
// calendar and arm an AlarmKit alarm before each upcoming meeting — so a meeting
// added while the app is closed still gets its reminder. This is the "catch a
// newly-added meeting without opening the app" safety net; the primary path is
// the foreground reconcile in JS (syncMeetings → reconcileAlarms).
//
// It is SELF-CONTAINED on the native side (no JS runs in the background): it
// reads the { enabled, minutesBefore } config that the JS layer mirrors into
// UserDefaults (CalendarModule.saveBackgroundConfig) and schedules meeting
// alarms with DETERMINISTIC ids (derived from the event id) so re-runs replace
// rather than duplicate. Stale alarms for removed/past meetings are cleaned up by
// the next foreground reconcile (which removes all and reschedules from scratch).
//
// NOTE: this targets the iOS 26 AlarmKit SDK and is verified on-device, like
// AlarmModule. The task identifier must match BGTaskSchedulerPermittedIdentifiers
// in Info.plist.

@objc(MeetingBackgroundSync)
class MeetingBackgroundSync: NSObject {

  static let taskId = "com.eleihuus.roycetravel.meetingrefresh"
  private static let store = EKEventStore()

  // Register the BGTask handler. Call once from didFinishLaunching.
  @objc static func register() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { task in
      handle(task as! BGAppRefreshTask)
    }
  }

  // Ask iOS to run the refresh again (no earlier than ~1h from now). Call from
  // didFinishLaunching and on entering the background.
  @objc static func schedule() {
    let request = BGAppRefreshTaskRequest(identifier: taskId)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
    do {
      try BGTaskScheduler.shared.submit(request)
    } catch {
      NSLog("[MeetingBackgroundSync] submit failed: \(error.localizedDescription)")
    }
  }

  private static func handle(_ task: BGAppRefreshTask) {
    schedule() // always chain the next refresh

    let defaults = UserDefaults.standard
    let enabled = defaults.bool(forKey: CalendarModule.kEnabled)
    let minutes = defaults.object(forKey: CalendarModule.kMinutes) as? Int ?? 8
    guard enabled else {
      task.setTaskCompleted(success: true)
      return
    }

    Task {
      let ok = await armMeetingAlarms(minutesBefore: minutes)
      task.setTaskCompleted(success: ok)
    }
    task.expirationHandler = {
      // Nothing long-running to cancel; AlarmKit scheduling is quick.
    }
  }

  // Read the next 30 days of events and arm a reminder before each meeting.
  private static func armMeetingAlarms(minutesBefore: Int) async -> Bool {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      // Need calendar access; in the background we can only proceed if already granted.
      let status = EKEventStore.authorizationStatus(for: .event)
      let granted: Bool
      if #available(iOS 17.0, *) {
        granted = status == .fullAccess
      } else {
        granted = status == .authorized
      }
      guard granted else { return false }

      let now = Date()
      let end = Date(timeIntervalSinceNow: 30 * 24 * 60 * 60)
      let predicate = store.predicateForEvents(withStart: now, end: end, calendars: nil)
      let events = store.events(matching: predicate)

      for ev in events where !ev.isAllDay {
        let fire = ev.startDate.addingTimeInterval(TimeInterval(-minutesBefore * 60))
        guard fire > Date().addingTimeInterval(60) else { continue }
        let id = deterministicUUID(from: ev.eventIdentifier ?? UUID().uuidString)
        let hhmm = shortTime(ev.startDate, timeZone: ev.timeZone)
        let title = "\((ev.title ?? "Meeting")) — meeting at \(hhmm)"
        try? AlarmManager.shared.cancel(id: id)
        do {
          try await scheduleAlarm(id: id, title: title, fireDate: fire)
        } catch {
          NSLog("[MeetingBackgroundSync] schedule failed: \(error.localizedDescription)")
        }
      }
      return true
    }
    #endif
    return false
  }

  // Stable UUID derived from the event identifier so re-runs replace, not duplicate.
  private static func deterministicUUID(from key: String) -> UUID {
    let digest = SHA256.hash(data: Data(key.utf8))
    var bytes = Array(digest.prefix(16))
    // Set version (5) and variant bits so it's a well-formed UUID.
    bytes[6] = (bytes[6] & 0x0F) | 0x50
    bytes[8] = (bytes[8] & 0x3F) | 0x80
    let uuidT: uuid_t = (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5],
                         bytes[6], bytes[7], bytes[8], bytes[9], bytes[10], bytes[11],
                         bytes[12], bytes[13], bytes[14], bytes[15])
    return UUID(uuid: uuidT)
  }

  private static func shortTime(_ date: Date, timeZone: TimeZone?) -> String {
    let f = DateFormatter()
    f.dateFormat = "HH:mm"
    f.timeZone = timeZone ?? TimeZone.current
    return f.string(from: date)
  }

  #if canImport(AlarmKit)
  @available(iOS 26.0, *)
  private static func scheduleAlarm(id: UUID, title: String, fireDate: Date) async throws {
    let alert = AlarmPresentation.Alert(
      title: LocalizedStringResource(stringLiteral: title),
      stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.fill")
    )
    let presentation = AlarmPresentation(alert: alert)
    let attributes = AlarmAttributes<CrewAlarmMetadata>(
      presentation: presentation,
      metadata: CrewAlarmMetadata(),
      tintColor: Color.purple
    )
    let configuration = AlarmManager.AlarmConfiguration<CrewAlarmMetadata>(
      schedule: .fixed(fireDate),
      attributes: attributes
    )
    _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
  }
  #endif
}
