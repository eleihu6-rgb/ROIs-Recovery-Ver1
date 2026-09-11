import Foundation
import React
#if canImport(AlarmKit)
import AlarmKit
#endif
#if canImport(SwiftUI)
import SwiftUI
#endif

// ─── AlarmKit bridge (Clock Setup Ver1, iOS 26) ──────────────────────────────
// Schedules system-style alarms via AlarmKit (iOS 26+). Exposed to React Native
// as the `AlarmModule` native module. On iOS < 26 every method rejects/no-ops.
//
// NOTE: AlarmKit is new in iOS 26; the exact initializer signatures below target
// the iOS 26.x SDK and are verified when building on-device. Adjust here if the
// SDK on your machine differs.

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct CrewAlarmMetadata: AlarmMetadata {
  init() {}
}
#endif

@objc(AlarmModule)
class AlarmModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // MARK: Authorization

  @objc(requestAuthorization:rejecter:)
  func requestAuthorization(_ resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      Task {
        do {
          let state = try await AlarmManager.shared.requestAuthorization()
          resolve(state == .authorized ? "authorized" : "denied")
        } catch {
          reject("auth_error", error.localizedDescription, error)
        }
      }
      return
    }
    #endif
    reject("unsupported", "AlarmKit requires iOS 26 or later", nil)
  }

  // MARK: Schedule

  // payload: { id, title, year, month, day, hour, minute, timeZone }
  @objc(scheduleAlarm:resolver:rejecter:)
  func scheduleAlarm(_ payload: NSDictionary,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      guard
        let title = payload["title"] as? String,
        let year = payload["year"] as? Int,
        let month = payload["month"] as? Int,
        let day = payload["day"] as? Int,
        let hour = payload["hour"] as? Int,
        let minute = payload["minute"] as? Int
      else {
        reject("bad_payload", "Missing alarm fields", nil)
        return
      }

      var calendar = Calendar(identifier: .gregorian)
      if let tzId = payload["timeZone"] as? String, let tz = TimeZone(identifier: tzId) {
        calendar.timeZone = tz
      }
      var comps = DateComponents()
      comps.year = year
      comps.month = month
      comps.day = day
      comps.hour = hour
      comps.minute = minute
      comps.second = (payload["second"] as? Int) ?? 0

      guard let date = calendar.date(from: comps) else {
        reject("bad_date", "Could not build alarm date", nil)
        return
      }

      // AlarmKit rejects fixed alarms at/behind "now" (generic "error 0").
      if date <= Date() {
        reject("past_alarm", "Alarm time is in the past: \(date)", nil)
        return
      }

      let idString = (payload["id"] as? String) ?? UUID().uuidString
      let id = UUID(uuidString: idString) ?? UUID()

      Task {
        do {
          NSLog("[AlarmModule] scheduling '\(title)' at \(date) (now=\(Date()))")
          try await self.schedule(id: id, title: title, fireDate: date)
          resolve(id.uuidString)
        } catch {
          let ns = error as NSError
          NSLog("[AlarmModule] schedule FAILED domain=\(ns.domain) code=\(ns.code) userInfo=\(ns.userInfo)")
          reject("schedule_error", "\(ns.domain) \(ns.code): \(error.localizedDescription)", error)
        }
      }
      return
    }
    #endif
    reject("unsupported", "AlarmKit requires iOS 26 or later", nil)
  }

  // MARK: Remove all

  @objc(removeAllAlarms:rejecter:)
  func removeAllAlarms(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      Task {
        do {
          let existing = try AlarmManager.shared.alarms
          for alarm in existing {
            try AlarmManager.shared.cancel(id: alarm.id)
          }
          resolve(existing.count)
        } catch {
          reject("remove_error", error.localizedDescription, error)
        }
      }
      return
    }
    #endif
    resolve(0)
  }

  // MARK: Remove single

  @objc(removeAlarm:resolver:rejecter:)
  func removeAlarm(_ alarmId: String,
                   resolver resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      guard let id = UUID(uuidString: alarmId) else {
        reject("bad_id", "Invalid UUID: \(alarmId)", nil)
        return
      }
      do {
        try AlarmManager.shared.cancel(id: id)
        resolve(nil)
      } catch {
        let ns = error as NSError
        NSLog("[AlarmModule] removeAlarm FAILED id=\(alarmId) \(ns.domain) \(ns.code)")
        reject("remove_error", "\(ns.domain) \(ns.code): \(error.localizedDescription)", error)
      }
      return
    }
    #endif
    resolve(nil)
  }

  // MARK: List scheduled

  @objc(getScheduledAlarms:rejecter:)
  func getScheduledAlarms(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      do {
        let existing = try AlarmManager.shared.alarms
        let out: [[String: Any]] = existing.map { alarm in
          ["id": alarm.id.uuidString, "state": String(describing: alarm.state)]
        }
        resolve(out)
      } catch {
        let ns = error as NSError
        reject("list_error", "\(ns.domain) \(ns.code): \(error.localizedDescription)", error)
      }
      return
    }
    #endif
    resolve([])
  }

  // MARK: - Private

  #if canImport(AlarmKit)
  @available(iOS 26.0, *)
  private func schedule(id: UUID, title: String, fireDate: Date) async throws {
    let alert = AlarmPresentation.Alert(
      title: LocalizedStringResource(stringLiteral: title),
      stopButton: AlarmButton(
        text: "Stop",
        textColor: .white,
        systemImageName: "stop.fill"
      )
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
