import Foundation
import EventKit
import React

// ─── EventKit bridge (Meeting integration) ───────────────────────────────────
// Reads the meetings already synced onto the device (the crew's Outlook/Exchange
// invites land in the iOS Calendar via the account's calendar sync). No Microsoft
// login, no backend — the data never leaves the phone. Exposed to React Native as
// the `CalendarModule` native module.
//
// The matching JS wrapper is src/features/meetings/calendarModule.ts.

@objc(CalendarModule)
class CalendarModule: NSObject {

  private let store = EKEventStore()

  // ISO-8601 with timezone offset, used for both parsing (start/end window) and
  // emitting absolute instants back to JS.
  private static let iso: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  // JS Date.toISOString() always includes milliseconds ("...00.000Z"), which a
  // plain ISO8601DateFormatter does NOT parse — it would return nil and make the
  // whole read fail. Parse leniently: try with fractional seconds, then without.
  private static func parseISO(_ s: String) -> Date? {
    let withFrac = ISO8601DateFormatter()
    withFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = withFrac.date(from: s) { return d }
    return iso.date(from: s)
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // Background config mirror: JS pushes { enabled, minutesBefore } here so the
  // BGTask refresh (MeetingBackgroundSync) can arm alarms with the app closed.
  static let kEnabled = "royce_meetings_enabled"
  static let kMinutes = "royce_meetings_minutes"

  // MARK: Authorization

  @objc(requestAccess:rejecter:)
  func requestAccess(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    let handler: EKEventStoreRequestAccessCompletionHandler = { granted, error in
      if let error = error {
        reject("calendar_auth_error", error.localizedDescription, error)
        return
      }
      resolve(granted ? "authorized" : "denied")
    }
    if #available(iOS 17.0, *) {
      store.requestFullAccessToEvents(completion: handler)
    } else {
      store.requestAccess(to: .event, completion: handler)
    }
  }

  // MARK: Read events

  // Returns events overlapping [startISO, endISO] as plain dictionaries.
  @objc(getEvents:endISO:resolver:rejecter:)
  func getEvents(_ startISO: String,
                 endISO: String,
                 resolver resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard
      let start = CalendarModule.parseISO(startISO),
      let end = CalendarModule.parseISO(endISO)
    else {
      reject("bad_window", "Invalid start/end ISO date: \(startISO) / \(endISO)", nil)
      return
    }
    let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
    let events = store.events(matching: predicate)
    let out: [[String: Any]] = events.map { ev in
      let tz = ev.timeZone?.identifier ?? TimeZone.current.identifier
      // Cap notes — the join link sits near the top, and full invite bodies can
      // be large across dozens of events.
      let notes = ev.notes.map { String($0.prefix(2000)) } ?? ""
      return [
        "id": ev.eventIdentifier ?? UUID().uuidString,
        "title": ev.title ?? "",
        "startISO": CalendarModule.iso.string(from: ev.startDate),
        "endISO": CalendarModule.iso.string(from: ev.endDate),
        "timeZone": tz,
        "calendarTitle": ev.calendar?.title ?? "",
        "allDay": ev.isAllDay,
        "cancelled": ev.status == .canceled,
        // Where a Teams/Zoom/Meet join link may live (URL field, location, notes).
        "url": ev.url?.absoluteString ?? "",
        "location": ev.location ?? "",
        "notes": notes,
      ]
    }
    resolve(out)
  }

  // MARK: Write events (Add flight to Calendar)

  // Creates one EKEvent per dictionary in `events` and resolves with their
  // eventIdentifiers, in the same order. JS keeps those ids so a second tap on
  // the flight card can remove exactly what it created.
  //
  // Each event is committed individually: EKEvent.eventIdentifier is only
  // assigned once the event is actually saved, so a batched commit would leave
  // us with nothing to remove them by later.
  @objc(saveEvents:resolver:rejecter:)
  func saveEvents(_ events: NSArray,
                  resolver resolve: @escaping RCTPromiseResolveBlock,
                  rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let calendar = store.defaultCalendarForNewEvents else {
      reject("no_calendar",
             "No default iOS calendar is available to add flights to.", nil)
      return
    }
    var ids: [String] = []
    for case let raw as NSDictionary in events {
      guard
        let title = raw["title"] as? String,
        let startISO = raw["startISO"] as? String,
        let endISO = raw["endISO"] as? String,
        let start = CalendarModule.parseISO(startISO),
        let end = CalendarModule.parseISO(endISO)
      else { continue }

      let ev = EKEvent(eventStore: store)
      ev.calendar = calendar
      ev.title = title
      ev.startDate = start
      ev.endDate = end
      ev.notes = raw["notes"] as? String
      // Marker the JS layer reads back: events we created for a duty carry this
      // scheme, so the meetings reader (and the background refresh) never treat
      // our own flight entries as Outlook/Exchange meetings. See
      // flightCalendar.ts → FLIGHT_EVENT_URL_PREFIX.
      if let urlString = raw["url"] as? String, let url = URL(string: urlString) {
        ev.url = url
      }
      if let tzName = raw["timeZone"] as? String, let tz = TimeZone(identifier: tzName) {
        ev.timeZone = tz
      }
      do {
        try store.save(ev, span: .thisEvent, commit: true)
        if let id = ev.eventIdentifier {
          ids.append(id)
        }
      } catch {
        // Roll back what we already wrote so a partial duty never lingers.
        CalendarModule.removeAll(ids, from: store)
        reject("calendar_save_failed", error.localizedDescription, error)
        return
      }
    }
    resolve(ids)
  }

  // Removes previously created events by identifier. Ids that no longer resolve
  // (the crew deleted the entry by hand) are skipped, not treated as errors —
  // the resolved count is how many were actually deleted.
  @objc(removeEvents:resolver:rejecter:)
  func removeEvents(_ ids: NSArray,
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    let list = ids.compactMap { $0 as? String }
    resolve(CalendarModule.removeAll(list, from: store))
  }

  @discardableResult
  private static func removeAll(_ ids: [String], from store: EKEventStore) -> Int {
    var removed = 0
    for id in ids {
      guard let ev = store.event(withIdentifier: id) else { continue }
      if (try? store.remove(ev, span: .thisEvent, commit: true)) != nil {
        removed += 1
      }
    }
    return removed
  }

  // MARK: Background config mirror

  @objc(saveBackgroundConfig:resolver:rejecter:)
  func saveBackgroundConfig(_ config: NSDictionary,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
    let defaults = UserDefaults.standard
    defaults.set((config["enabled"] as? Bool) ?? false, forKey: CalendarModule.kEnabled)
    defaults.set((config["minutesBefore"] as? Int) ?? 8, forKey: CalendarModule.kMinutes)
    resolve(nil)
  }
}
