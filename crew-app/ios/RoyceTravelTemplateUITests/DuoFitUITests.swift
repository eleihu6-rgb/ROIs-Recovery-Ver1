import XCTest
import EventKit

/// iPhone Duo fit — native XCUITest on the Duo's unfolded INNER screen.
///
/// Why XCUITest and not Maestro: Maestro only drives the Duo's outer display, so
/// it cannot tap the app on the inner (wide) screen. Regular-iPhone regression
/// stays on Maestro (`.maestro/`); this suite is for the Duo's wide layout only.
///
/// Logs in as Emirates crew K1001 (October 2026 roster on cr.rois.one) through the
/// real login UI and walks the screens changed for the Duo, asserting the wide
/// layout and saving one screenshot per step.
///
/// Run (Metro on :8081, app built for the Duo):
///   ios/scripts/duo-shot-watcher.sh <duo-udid> <shot-dir> &   # host-side inner-screen capture
///   TEST_RUNNER_DUO_SHOT_DIR=<shot-dir> xcodebuild test -workspace RoyceTravelTemplate.xcworkspace \
///     -scheme RoyceTravelTemplateUITests -destination 'id=<duo-udid>'
final class DuoFitUITests: XCTestCase {
  private let app = XCUIApplication()
  private let crewId = "K1001"

  override func setUpWithError() throws {
    continueAfterFailure = false
    try seedFinalistOct14Calendar()
    // `xcodebuild test` reinstalls the app, wiping any `simctl defaults write`; pass
    // the roster API (where K1001's roster lives) through the argument domain,
    // which `NativeModules.SettingsManager` reads like any user default.
    let api = ProcessInfo.processInfo.environment["DUO_ROSTER_API"] ?? "https://cr.rois.one/api"
    app.launchArguments += ["-F8RosterApiBaseURL", api]
    // The Duo inner screen is used both ways: landscape (~951x669pt, wide layout)
    // and rotated 90° to portrait (~669x951pt). DUO_ORIENTATION picks the run.
    switch ProcessInfo.processInfo.environment["DUO_ORIENTATION"] {
    case "portrait": XCUIDevice.shared.orientation = .portrait
    case "landscape": XCUIDevice.shared.orientation = .landscapeLeft
    default: break
    }
    if ProcessInfo.processInfo.environment["IPAD_SHOT_DIR"] != nil {
      XCUIDevice.shared.orientation = .portrait
    }
    if ProcessInfo.processInfo.environment["ROUTE_DEVICE"] != "duo" {
      switch ProcessInfo.processInfo.environment["CALENDAR_ORIENTATION"] {
      case "landscape": XCUIDevice.shared.orientation = .landscapeLeft
      case "portrait": XCUIDevice.shared.orientation = .portrait
      default: break
      }
    }
    app.launch()
  }

  func testTicketPolishNavigation() throws {
    let device = ProcessInfo.processInfo.environment["TICKET_DEVICE"] ?? "air"
    let version = ProcessInfo.processInfo.environment["TICKET_VERSION"] ?? "2"
    let dir = try XCTUnwrap(ProcessInfo.processInfo.environment["TICKET_SHOT_DIR"])
    func capture(_ state: String) throws {
      let name = "ticket-polish-\(device)-\(state)-Ver\(version).png"
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent(name))
    }
    let prCrew = ProcessInfo.processInfo.environment["TICKET_PR_CREW"] ?? "473006"
    try signInAsPR(prCrew, usePrefilledPassword: true)
    wait("qa-duty-swap").tap()
    if el("swap-disclaimer").waitForExistence(timeout: 5) { tapDialogConfirm("swap-disclaimer") }
    if el("app-dialog").exists { tapDialogConfirm("app-dialog") }
    if el("twin-disclaimer").exists { tapDialogConfirm("twin-disclaimer") }
    wait("approach-ticket").tap()
    if el("app-dialog").waitForExistence(timeout: 5) { tapDialogConfirm("app-dialog") }
    wait("ticket-give")
    for stage in ["give", "want", "match", "send"] { XCTAssertTrue(el("ticket-stage-\(stage)").exists) }
    XCTAssertFalse(el("ticket-next").isEnabled)
    let duty = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'ticket-give-' AND enabled == true")).firstMatch
    XCTAssertTrue(duty.waitForExistence(timeout: 30), "No unlocked duty for PR; inspect portal/empty state")
    let available = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'ticket-give-' AND enabled == true")).allElementsBoundByIndex.filter { $0.isHittable }
    XCTAssertGreaterThanOrEqual(available.count, 1, "No unlocked duty for PR; inspect portal/empty state")
    let selectedCount = min(available.count, 2)
    for duty in available.prefix(selectedCount) { duty.tap() }
    XCTAssertTrue(text("\(selectedCount) selected").waitForExistence(timeout: 5))
    XCTAssertTrue(el("ticket-give").exists)
    try capture("give")
    wait("ticket-next").tap()
    XCTAssertTrue(el("ticket-selected-give").exists)
    try capture("want")
    wait("ticket-next").tap()
    let match = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'ticket-match-' AND enabled == true")).firstMatch
    XCTAssertTrue(match.waitForExistence(timeout: 30), "No matching published duty; inspect portal response")
    XCTAssertFalse(match.isSelected, "Pick should start without a selected crew")
    let matchID = match.identifier
    match.tap()
    XCTAssertTrue(wait(matchID).isSelected, "tapping a crew should select the Pick card")
    wait("ticket-matches")
    try capture("match")
    wait("ticket-next").tap()
    wait("swap-ticket")
    XCTAssertTrue(el("ticket-selected-give").exists, "Send is missing the bounded give summary")
    XCTAssertTrue(el("ticket-selected-take").exists, "Send is missing the bounded take summary")
    XCTAssertTrue(el("ticket-send").exists)
    try capture("review")
    wait("ticket-back").tap()
    wait("ticket-matches")
    wait("ticket-next").tap()
    wait("swap-ticket")
    // Read-only validation: do not submit a real swap request. TG skipped by Ryan.
  }

  // MARK: helpers

  private func el(_ id: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: id).firstMatch
  }

  @discardableResult
  private func wait(_ id: String, _ timeout: TimeInterval = 30, file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
    let e = el(id)
    XCTAssertTrue(e.waitForExistence(timeout: timeout), "\(id) did not appear", file: file, line: line)
    return e
  }

  private func text(_ fragment: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", fragment)).firstMatch
  }

  /// Screenshot of the INNER screen. XCUITest's own `app.screenshot()` captures the
  /// Duo's outer display (black here), so the test asks the host to grab display 3:
  /// it drops `<name>.request` in DUO_SHOT_DIR and waits for `<name>.done`, written by
  /// `ios/scripts/duo-shot-watcher.sh` after `simctl io --display=3 screenshot`.
  private func shot(_ name: String) {
    guard let dir = ProcessInfo.processInfo.environment["DUO_SHOT_DIR"] else { return }
    let base = URL(fileURLWithPath: dir)
    let done = base.appendingPathComponent("\(name).done")
    try? FileManager.default.removeItem(at: done)
    FileManager.default.createFile(atPath: base.appendingPathComponent("\(name).request").path, contents: nil)
    let deadline = Date().addingTimeInterval(20)
    while !FileManager.default.fileExists(atPath: done.path) && Date() < deadline {
      Thread.sleep(forTimeInterval: 0.3)
    }
    XCTAssertTrue(FileManager.default.fileExists(atPath: done.path), "host did not capture \(name) — is duo-shot-watcher.sh running?")
  }

  private var appFrame: CGRect { app.windows.firstMatch.frame }

  /// The layout class the app itself derives from the window width (useLayout.ts).
  private enum LayoutClass { case compact, tall, wide }
  private var layoutClass: LayoutClass {
    let w = appFrame.width
    return w >= 700 ? .wide : w >= 560 ? .tall : .compact
  }

  /// Per-page layout check: `id` must exist on the given class, and must NOT exist
  /// on the others (so the phone layout is proven untouched on the outer screen).
  private func expectLayout(_ id: String, on cls: LayoutClass, file: StaticString = #filePath, line: UInt = #line) {
    let present = el(id).waitForExistence(timeout: 5)
    if layoutClass == cls {
      XCTAssertTrue(present, "\(id) missing on the \(cls) layout (\(appFrame.size))", file: file, line: line)
    } else {
      XCTAssertFalse(present, "\(id) must not render on the \(layoutClass) layout (\(appFrame.size))", file: file, line: line)
    }
  }

  private func replaceText(_ field: XCUIElement, with value: String, accepting normalizedValue: String? = nil, file: StaticString = #filePath, line: UInt = #line) {
    // Tap the field's far right so the caret lands AFTER the existing text — a
    // centre tap drops it mid-word and the deletes leave a prefix ("K1K1001").
    // The field's value can lag or read as the placeholder, so delete generously
    // and check what landed (a leftover "433" once made 452320 into 433452320).
    for _ in 0..<3 {
      field.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
      let focused = NSPredicate(format: "hasKeyboardFocus == true")
      if !field.waitForFocus(focused, timeout: 2) {
        field.tap()
      }
      guard field.waitForFocus(focused, timeout: 2) else { continue }
      let current = (field.value as? String) ?? ""
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: max(current.count, 12) + 8))
      field.typeText(value)
      let now = (field.value as? String) ?? ""
      // A secure field reads back as bullets: compare lengths only.
      if now == value || now == normalizedValue || (field.elementType == .secureTextField && now.count == value.count) { return }
    }
    XCTFail("could not type \(field.identifier): reads \((field.value as? String) ?? "")", file: file, line: line)
  }

  private func seedFinalistOct14Calendar() throws {
    guard ProcessInfo.processInfo.environment["SEED_FINALIST_OCT14"] == "1" else { return }
    let store = EKEventStore()
    if #available(iOS 17.0, *) {
      XCTAssertEqual(EKEventStore.authorizationStatus(for: .event), .fullAccess,
        "grant Calendar access to the UI-test runner before seeding")
    } else {
      XCTAssertEqual(EKEventStore.authorizationStatus(for: .event), .authorized,
        "grant Calendar access to the UI-test runner before seeding")
    }
    let zone = try XCTUnwrap(TimeZone(identifier: "Asia/Manila"))
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    func date(_ day: Int, _ hour: Int, _ minute: Int) -> Date {
      calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }
    let windowStart = date(13, 0, 0)
    let windowEnd = date(24, 0, 0)
    let titles = ["RBC Credit Due", "EK371 · BKK → DXB", "Get Ready · PR740", "Leave Home · PR740",
      "Check-in PR740 · MNL", "Get Ready · PR585", "Flair Weekly Meeting - Every Wed - 10:00/HGH",
      "Leave Home · PR585", "Check-in PR585 · MNL", "PR585 · MNL → DAD", "PR586 · DAD → MNL",
      "PR103 · LAX → MNL", "PR116 · MNL → YVR", "EK202 · JFK → DXB", "PR215 · MNL → POM",
      "PR216 · POM → MNL", "Get Ready · PR507", "Leave Home · PR507", "Check-in PR507 · MNL",
      "PR507 · MNL → SIN", "SIA-CPS Technical call", "PR508 · SIN → MNL", "PR117 · YVR → MNL",
      "Weekly Sync (Ryan/Jen/Sameer)", "CPS - Weekly Status call", "Wake Up · PR684", "Leave Home · PR684",
      "Check-in PR684 · MNL", "PR684 · MNL → DOH", "Wake Up · EK763", "Leave Home · EK763",
      "Check-in EK763 · DXB", "EK763 · DXB → JNB", "Enhance CrewSE App/Portal planning meeting",
      "Get Ready · PR685", "Leave Home · PR685", "Check-in PR685 · DOH", "PR685 · DOH → MNL",
      "EK764 · JNB → DXB"]
    for event in store.events(matching: store.predicateForEvents(withStart: windowStart, end: windowEnd, calendars: nil))
      where titles.contains(event.title ?? "") {
      try store.remove(event, span: .thisEvent, commit: false)
    }
    struct Fixture { let title: String; let start: Date; let end: Date; let allDay: Bool; let notes: String?; let url: String? }
    let teamURL = "https://teams.microsoft.com/l/meetup-join/finalist-oct14"
    var fixtures = [
      Fixture(title: titles[0], start: date(14,0,0), end: date(15,0,0), allDay: true, notes: nil, url: nil),
      Fixture(title: titles[1], start: date(13,22,35), end: date(14,4,35), allDay: false, notes: nil, url: nil),
      Fixture(title: titles[2], start: date(14,1,35), end: date(14,1,50), allDay: false, notes: nil, url: "royce://flight/PR740-ready"),
      Fixture(title: titles[3], start: date(14,2,35), end: date(14,2,50), allDay: false, notes: nil, url: "royce://flight/PR740-leave"),
      Fixture(title: titles[4], start: date(14,3,35), end: date(14,3,50), allDay: false, notes: nil, url: "royce://flight/PR740-checkin"),
      Fixture(title: titles[5], start: date(14,8,50), end: date(14,9,5), allDay: false, notes: nil, url: "royce://flight/PR585-ready"),
      Fixture(title: titles[6], start: date(14,9,0), end: date(14,9,30), allDay: false, notes: "經過和團隊成員溝通，項目管理和溝通在這裡。\n\(teamURL)", url: teamURL),
      Fixture(title: titles[7], start: date(14,9,50), end: date(14,10,5), allDay: false, notes: nil, url: "royce://flight/PR585-leave"),
      Fixture(title: titles[8], start: date(14,10,50), end: date(14,11,5), allDay: false, notes: nil, url: "royce://flight/PR585-checkin"),
      Fixture(title: titles[9], start: date(14,12,50), end: date(14,15,20), allDay: false, notes: nil, url: "royce://flight/PR585"),
      Fixture(title: titles[10], start: date(14,16,30), end: date(14,19,20), allDay: false, notes: nil, url: "royce://flight/PR586"),
    ]
    fixtures += [
      Fixture(title: titles[11], start: date(17,13,45), end: date(18,4,30), allDay: false, notes: "Get Ready 23:05 · Leave Home 00:05 · Check-in 01:05", url: "royce://flight/PR103"),
      Fixture(title: titles[12], start: date(17,19,40), end: date(18,7,55), allDay: false, notes: "Wake Up 08:40 · Leave Home 09:40 · Check-in 10:40", url: "royce://flight/PR116"),
      Fixture(title: titles[13], start: date(17,9,45), end: date(17,22,45), allDay: false, notes: "Wake Up 04:40 · Leave Home 05:40 · Check-in 06:40", url: "royce://flight/EK202"),
      Fixture(title: titles[14], start: date(17,23,20), end: date(18,4,50), allDay: false, notes: "Get Ready 12:20 · Leave Home 13:20 · Check-in 14:20", url: "royce://flight/PR215"),
      Fixture(title: titles[15], start: date(18,6,5), end: date(18,11,30), allDay: false, notes: "POM to MNL", url: "royce://flight/PR216"),
      Fixture(title: titles[16], start: date(19,4,30), end: date(19,4,45), allDay: false, notes: nil, url: "royce://flight/PR507-ready"),
      Fixture(title: titles[17], start: date(19,5,30), end: date(19,5,45), allDay: false, notes: nil, url: "royce://flight/PR507-leave"),
      Fixture(title: titles[18], start: date(19,6,30), end: date(19,6,45), allDay: false, notes: nil, url: "royce://flight/PR507-checkin"),
      Fixture(title: titles[19], start: date(19,8,30), end: date(19,12,15), allDay: false, notes: nil, url: "royce://flight/PR507"),
      Fixture(title: titles[20], start: date(19,9,0), end: date(19,10,0), allDay: false, notes: "FYI SQ weekly tech call", url: teamURL),
      Fixture(title: titles[21], start: date(19,13,30), end: date(19,17,30), allDay: false, notes: nil, url: "royce://flight/PR508"),
      Fixture(title: titles[22], start: date(19,15,5), end: date(20,4,45), allDay: false, notes: nil, url: "royce://flight/PR117"),
      Fixture(title: titles[23], start: date(20,0,30), end: date(20,1,0), allDay: false, notes: nil, url: teamURL),
      Fixture(title: titles[24], start: date(20,13,0), end: date(20,14,0), allDay: false, notes: nil, url: teamURL),
      Fixture(title: titles[25], start: date(20,14,0), end: date(20,14,15), allDay: false, notes: nil, url: "royce://flight/PR684-wake"),
      Fixture(title: titles[26], start: date(20,15,0), end: date(20,15,15), allDay: false, notes: nil, url: "royce://flight/PR684-leave"),
      Fixture(title: titles[27], start: date(20,16,0), end: date(20,16,15), allDay: false, notes: nil, url: "royce://flight/PR684-checkin"),
      Fixture(title: titles[28], start: date(20,18,0), end: date(21,3,40), allDay: false, notes: nil, url: "royce://flight/PR684"),
      Fixture(title: titles[29], start: date(21,7,15), end: date(21,7,30), allDay: false, notes: nil, url: "royce://flight/EK763-wake"),
      Fixture(title: titles[30], start: date(21,8,15), end: date(21,8,30), allDay: false, notes: nil, url: "royce://flight/EK763-leave"),
      Fixture(title: titles[31], start: date(21,9,15), end: date(21,9,30), allDay: false, notes: nil, url: "royce://flight/EK763-checkin"),
      Fixture(title: titles[32], start: date(21,11,15), end: date(21,20,40), allDay: false, notes: nil, url: "royce://flight/EK763"),
      Fixture(title: titles[33], start: date(22,14,0), end: date(22,15,30), allDay: false, notes: "เรียน คณะทำงานฯ", url: teamURL),
      Fixture(title: titles[34], start: date(23,1,30), end: date(23,1,45), allDay: false, notes: nil, url: "royce://flight/PR685-ready"),
      Fixture(title: titles[35], start: date(23,2,30), end: date(23,2,45), allDay: false, notes: nil, url: "royce://flight/PR685-leave"),
      Fixture(title: titles[36], start: date(23,3,30), end: date(23,3,45), allDay: false, notes: nil, url: "royce://flight/PR685-checkin"),
      Fixture(title: titles[37], start: date(23,5,30), end: date(23,15,35), allDay: false, notes: nil, url: "royce://flight/PR685"),
      Fixture(title: titles[38], start: date(23,2,35), end: date(23,10,50), allDay: false, notes: nil, url: "royce://flight/EK764"),
      Fixture(title: titles[24], start: date(23,13,0), end: date(23,14,0), allDay: false, notes: nil, url: teamURL),
    ]
    for fixture in fixtures {
      let event = EKEvent(eventStore: store)
      event.calendar = store.defaultCalendarForNewEvents
      event.title = fixture.title
      event.startDate = fixture.start
      event.endDate = fixture.end
      event.isAllDay = fixture.allDay
      event.timeZone = zone
      event.notes = fixture.notes
      event.url = fixture.url.flatMap(URL.init(string:))
      try store.save(event, span: .thisEvent, commit: false)
    }
    try store.commit()
  }

  /// Ends on Home signed in as K1001, whatever state the app was left in.
  private func signInAsK1001() {
    if el("home-screen").waitForExistence(timeout: 25) {
      el("tab-profile").tap()
      if text(crewId).waitForExistence(timeout: 5) {
        el("tab-home").tap()
        return
      }
      // Guest or another crew: sign out through the real dialog.
      let addAirline = el("profile-add-airline")
      if addAirline.exists { addAirline.tap() } else { el("profile-logout").tap() }
      wait("profile-dialog-confirm").tap()
    }
    wait("login-screen", 60)
    el("airline-dropdown").tap()
    let search = wait("airline-search")
    sleep(1) // let the slide-up finish before the capture
    shot("00_airline_picker")
    replaceText(search, with: "Emirates")
    wait("airline-EK").tap()
    // Choosing EK prefills the shared EK test account; only the crew ID changes.
    replaceText(wait("crew-id"), with: crewId)
    // The Login button stays visible beside the keyboard on the wide layout; the
    // keyboard's own Return key is reported outside the inner screen, so don't use it.
    el("login-btn").tap()
    wait("home-screen", 180)
  }

  // MARK: the walk

  /// PR 473006 ▸ Trip Details: portal-published duty metrics sit together on the
  /// duty card in the requested operational scan order. This focused path runs on
  /// Air, Duo Test, and iPad; the runner supplies the device label + screenshot dir.
  func testTripDutyMetricsPR473006() throws {
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["TRIP_METRICS_SHOT_DIR"])
    let device = ProcessInfo.processInfo.environment["TRIP_METRICS_DEVICE"] ?? "air"
    let version = ProcessInfo.processInfo.environment["TRIP_METRICS_SHOT_VERSION"] ?? "1"
    let name = "trip-duty-metrics-pr473006-\(device)-Ver\(version)"

    try signInAsPR("473006", usePrefilledPassword: true)
    wait("home-next-trip").tap()
    wait("page-trip-details")
    let band = wait("duty-band-0")
    let block = wait("duty-metric-block-0")
    let fdp = wait("duty-metric-fdp-0")
    let dp = wait("duty-metric-dp-0")
    let rest = wait("duty-metric-rest-0")

    for (label, metric) in [("BLOCK", block), ("FDP", fdp), ("DP", dp), ("REST", rest)] {
      XCTAssertTrue(metric.label.contains(label), "\(label) is missing from the duty-level metric cell: \(metric.label)")
      XCTAssertTrue(metric.label.range(of: #"\d+h(?: \d+m)?|\d+m"#, options: .regularExpression) != nil,
                    "\(label) has no duration value: \(metric.label)")
      XCTAssertTrue(band.frame.contains(metric.frame), "\(label) must stay inside the duty card")
    }
    XCTAssertLessThan(block.frame.midX, fdp.frame.midX, "BLOCK must be before FDP")
    XCTAssertLessThan(fdp.frame.midX, dp.frame.midX, "FDP must be before DP")
    XCTAssertLessThan(dp.frame.midX, rest.frame.midX, "DP must be before REST")

    if device == "duo" {
      shot(name)
    } else {
      let url = URL(fileURLWithPath: directory).appendingPathComponent("\(name).png")
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: url)
    }
  }

  /// PR 473006 ▸ Duty Analyzer: move a real multi-segment duty through the current
  /// touch UI, verify its HH:MM result and applied FDP reference, then capture it.
  func testDutyAnalyzerPR473006() throws {
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["ANALYZER_SHOT_DIR"])
    let device = ProcessInfo.processInfo.environment["ANALYZER_DEVICE"] ?? "duo"
    let version = ProcessInfo.processInfo.environment["ANALYZER_SHOT_VERSION"] ?? "1"
    func capture(_ state: String) throws {
      let name = "duty-analyzer-pr-473006-\(device)-\(state)-Ver\(version)"
      if device == "duo" { shot(name) }
      else {
        let base = URL(fileURLWithPath: directory)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        try XCUIScreen.main.screenshot().pngRepresentation.write(to:
          base.appendingPathComponent("\(name).png"))
      }
    }
    func reveal(_ element: XCUIElement, in scrollID: String? = nil) {
      let scroller: XCUIElement
      if let scrollID {
        scroller = wait(scrollID)
      } else {
        scroller = wait("duty-analyzer")
      }
      for _ in 0..<16 where !element.isHittable {
        scroller.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.82))
          .press(forDuration: 0.05, thenDragTo:
            scroller.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.18)))
      }
      XCTAssertTrue(element.isHittable, "\(element.identifier) did not become hittable")
    }
    func duty(prefix: String, index: Int = 0) -> XCUIElement {
      app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix))
        .element(boundBy: index)
    }

    try signInAsPR("473006", usePrefilledPassword: true)
    let analyzer = wait("qa-analyzer")
    if !analyzer.isHittable {
      for _ in 0..<4 where !analyzer.isHittable { wait("home-screen").swipeUp() }
    }
    XCTAssertTrue(analyzer.isHittable, "Analyzer quick action did not become hittable")
    analyzer.tap()
    wait("duty-analyzer")

    wait("analyzer-mode-new").tap()
    wait("analyzer-new-form")
    XCTAssertTrue(wait("analyzer-new-duty-projection").label.contains("MAX FDP"))
    XCTAssertTrue(
      wait("metric-fdp").label.contains("Awaiting last chock-on time"),
      "Blank FDP must wait for the latest chock-on input"
    )
    XCTAssertTrue(
      wait("metric-dp").label.contains("Awaiting last chock-on time"),
      "Blank DP must wait for the latest chock-on input"
    )
    XCTAssertFalse(el("analyzer-fdp").exists, "New duty must calculate FDP rather than ask for it")
    XCTAssertFalse(el("analyzer-dp").exists, "New duty must calculate DP rather than ask for it")
    replaceText(wait("analyzer-report"), with: "0700", accepting: "07:00")
    replaceText(wait("analyzer-chock-on"), with: "1830", accepting: "18:30")
    // The Duo reports the full form in display-global coordinates beyond the app
    // frame, so tapping that container has no valid activation point. This visible
    // label stays inside the left pane and commits the focused clock field.
    text("Duty facts").tap()
    let newDutyResult = wait("analyzer-result")
    reveal(newDutyResult)
    XCTAssertTrue(newDutyResult.label.range(of: #"FDP.*11:30.*Limit 13:00"#, options: [.regularExpression, .caseInsensitive]) != nil, newDutyResult.label)
    if device == "duo" {
      let actionRail = wait("analyzer-action-rail-edge")
      XCTAssertGreaterThanOrEqual(actionRail.frame.minX, appFrame.maxX - 84, "New-duty actions must start inside the Duo right-edge strip")
      XCTAssertTrue(wait("analyzer-reset").isHittable, "New-duty Reset must remain reachable in the Duo rail")
      XCTAssertTrue(wait("analyzer-save").isHittable, "New-duty Save must remain reachable in the Duo rail")
    } else {
      XCTAssertFalse(el("analyzer-action-rail-edge").exists, "iPad must not render the Duo-only action rail")
      XCTAssertTrue(wait("analyzer-content-actions").exists, "iPad must render in-content new-duty actions")
      XCTAssertTrue(wait("analyzer-reset").isHittable, "iPad New-duty Reset must remain reachable")
      XCTAssertTrue(wait("analyzer-save").isHittable, "iPad New-duty Save must remain reachable")
    }
    let resetStartedAt = Date()
    wait("analyzer-reset").tap()
    let resetEndedAt = Date()
    let resetReport = (wait("analyzer-report").value as? String) ?? ""
    let expectedResetReports = [resetStartedAt, resetEndedAt].map {
      String(format: "%02d:%02d", Calendar.current.component(.hour, from: $0), Calendar.current.component(.minute, from: $0))
    }
    XCTAssertTrue(expectedResetReports.contains(resetReport), "Reset must start a fresh scenario at the current local minute: \(resetReport)")
    XCTAssertNotEqual(resetReport, "07:00", "Reset must discard the edited report time")
    XCTAssertEqual((wait("analyzer-chock-on").value as? String) ?? "", "", "Reset must clear latest chock-on")
    XCTAssertTrue(wait("analyzer-sectors-value").label.contains("2"), "Reset must restore two sectors")
    XCTAssertTrue(wait("analyzer-composition-basic").isSelected, "Reset must restore Basic crew")
    XCTAssertTrue(wait("analyzer-rest-location-home").isSelected, "Reset must restore Home")
    try capture("new-duty-reset")
    // The fresh iPad import exposes the current October roster; the historical
    // Sep 6 PR501/PR512 fixture is retained only on the dedicated Duo test state.
    if device == "ipad" { return }

    let rosterTab = el("analyzer-mode-roster")
    if rosterTab.waitForExistence(timeout: 3) {
      reveal(rosterTab, in: "analyzer-basic-scroll")
      rosterTab.tap()
    } else {
      let rosterLabel = text("My roster")
      XCTAssertTrue(rosterLabel.waitForExistence(timeout: 5), "My roster tab did not appear")
      rosterLabel.tap()
    }

    let twoSegmentPrefix = "analyzer-duty-473006-2026-09-06"
    reveal(duty(prefix: twoSegmentPrefix))
    let twoSegment = duty(prefix: twoSegmentPrefix)
    XCTAssertTrue(twoSegment.waitForExistence(timeout: 5), "PR501/PR512 duty disappeared after roster scrolling")
    twoSegment.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    wait("analyzer-timeline")

    if layoutClass != .wide {
      let secondFlight = duty(prefix: "analyzer-segment-select-", index: 1)
      reveal(secondFlight, in: "analyzer-single-column")
      secondFlight.tap()
      reveal(wait("analyzer-action-move"), in: "analyzer-single-column")
      wait("analyzer-action-move").tap()
      let shift = wait("analyzer-shift-minutes")
      reveal(shift, in: "analyzer-single-column")
      replaceText(shift, with: "60")
      wait("analyzer-shift-apply").tap()
    } else {
      XCTAssertTrue(wait("analyzer-editor-scroll").exists)
      XCTAssertTrue(wait("analyzer-summary-scroll").exists)
      let actionRail = wait("analyzer-action-rail-edge")
      XCTAssertGreaterThanOrEqual(actionRail.frame.minX, appFrame.maxX - 84, "Analyzer actions must start inside the Duo right-edge strip")
      XCTAssertLessThanOrEqual(actionRail.frame.maxX, appFrame.maxX + 1, "Analyzer actions must stay inside the Duo right-edge strip")
      XCTAssertFalse(el("analyzer-reset-top").exists, "Duo must not duplicate Reset in the title bar")
      XCTAssertTrue(wait("analyzer-reset").isHittable, "Reset must remain reachable in the Duo rail")
      XCTAssertTrue(wait("analyzer-save").isHittable, "Save scenario must remain reachable in the Duo rail")
      let compactTimes = duty(prefix: "analyzer-segment-times-compact-")
      XCTAssertTrue(compactTimes.exists, "Duo segment times must share one compact row")
      let departureEarlier = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'analyzer-segment-dep-' AND identifier ENDSWITH '-earlier'")).firstMatch
      let arrivalEarlier = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'analyzer-segment-arr-' AND identifier ENDSWITH '-earlier'")).firstMatch
      XCTAssertTrue(departureEarlier.exists && arrivalEarlier.exists, "Duo departure and arrival steppers must both exist")
      XCTAssertEqual(departureEarlier.frame.minY, arrivalEarlier.frame.minY, accuracy: 1, "Duo departure and arrival controls must align vertically")
      let editorScroll = wait("analyzer-editor-scroll")
      let discretion = wait("analyzer-discretion")
      for _ in 0..<8 where !discretion.isHittable { editorScroll.swipeUp() }
      XCTAssertTrue(discretion.isHittable, "Duo rule controls must stay reachable below the compact timeline")
    }

    let result = wait("analyzer-result")
    reveal(result, in: layoutClass == .wide ? "analyzer-summary-scroll" : "analyzer-single-column")
    let metricOptions: String.CompareOptions = [.regularExpression, .caseInsensitive]
    XCTAssertTrue(result.label.range(of: #"FDP.*\d{2}:\d{2}"#, options: metricOptions) != nil, result.label)
    XCTAssertTrue(result.label.range(of: #"DP.*\d{2}:\d{2}"#, options: metricOptions) != nil, result.label)
    XCTAssertTrue(result.label.range(of: #"REST.*\d{2}:\d{2}"#, options: metricOptions) != nil, result.label)
    XCTAssertTrue(result.label.range(of: #"BLOCK.*\d{2}:\d{2}"#, options: metricOptions) != nil, result.label)
    XCTAssertNil(result.label.range(of: #"\d+h \d+m"#, options: .regularExpression), "duration still uses the old unit format: \(result.label)")
    if layoutClass == .wide {
      let editorScroll = wait("analyzer-editor-scroll")
      for _ in 0..<8 { editorScroll.swipeDown() }
    }
    try capture("result-compact-rail")
    if layoutClass == .wide {
      wait("analyzer-save").tap()
      XCTAssertTrue(wait("analyzer-saved-dialog").exists, "Duo rail Save must store the scenario")
      wait("analyzer-saved-dialog-confirm").tap()
    }

    let reference = wait("analyzer-open-reference")
    reveal(reference, in: layoutClass == .wide ? "analyzer-summary-scroll" : "analyzer-single-column")
    reference.tap()
    wait("duty-analyzer-reference")
    XCTAssertTrue(wait("easa-report-local").label.contains("13:25"))
    XCTAssertTrue(wait("easa-report-range").label.contains("13:00–13:59"))
    XCTAssertTrue(wait("easa-landings").label.contains("2"))
    XCTAssertTrue(wait("easa-max-fdp").label.contains("12:00"))
    XCTAssertTrue(wait("easa-selected-cell").label.contains("12:00"))
    XCTAssertTrue(wait("easa-official-range").label.contains("06:00–13:29"))
    XCTAssertTrue(wait("easa-official-sectors").label.contains("1–2"))
    XCTAssertTrue(wait("easa-official-max-fdp").label.contains("13:00"))
    XCTAssertTrue(wait("easa-comparison-note").label.contains("12:00 instead of the EASA baseline 13:00"))
    if layoutClass == .wide {
      XCTAssertTrue(wait("easa-reference-columns").exists)
      XCTAssertFalse(el("easa-reference-single").exists)
    } else {
      XCTAssertTrue(wait("easa-reference-single").exists)
      XCTAssertFalse(el("easa-reference-columns").exists)
    }
    try capture("easa-applied")

    let source = wait("easa-source")
    if !source.isHittable {
      let referencePage = layoutClass == .wide ? wait("easa-reference-left-scroll") : wait("easa-reference-single")
      for _ in 0..<12 where !source.isHittable { referencePage.swipeUp() }
    }
    XCTAssertTrue(source.label.contains("ORO.FTL.205"), source.label)
    try capture("easa-reference")
  }

  /// Home dashboard validation shared by Air, Duo inner, and iPad landscape.
  /// Air also rotates back to portrait to prove the phone layout stays unchanged.
  func testHomeLandscapeDashboardPR473006() throws {
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["HOME_SHOT_DIR"])
    let device = ProcessInfo.processInfo.environment["HOME_DEVICE"] ?? "air"
    let version = ProcessInfo.processInfo.environment["HOME_SHOT_VERSION"] ?? "1"
    func capture(_ state: String) throws {
      let name = "home-landscape-dashboard-\(device)-\(state)-Ver\(version)"
      if device == "duo" {
        shot(name)
      } else {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)

        if device != "physical" {
          let base = URL(fileURLWithPath: directory)
          try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
          try screenshot.pngRepresentation.write(to:
            base.appendingPathComponent("\(name).png"))
        }
      }
    }

    try signInAsPR("473006", usePrefilledPassword: true)

    if device == "duo"
      && ProcessInfo.processInfo.environment["DUO_ORIENTATION"] == "portrait" {
      let explore = wait("home-tall-explore")
      let firstCard = wait("dest-HKG")
      let secondCard = wait("dest-HND")
      let quick = wait("home-quick-actions")
      XCTAssertFalse(el("home-landscape-dashboard").exists, "Duo portrait must keep the tall Home composition")
      XCTAssertEqual(firstCard.frame.minY, secondCard.frame.minY, accuracy: 1, "Duo portrait destination cards must stay in one row")
      XCTAssertGreaterThan(firstCard.frame.height, firstCard.frame.width, "Duo portrait destination cards must extend vertically")
      XCTAssertGreaterThan(quick.frame.minY, explore.frame.maxY, "Quick actions must remain below the destination row")
      XCTAssertLessThan(quick.frame.minY - firstCard.frame.maxY, 80, "Destination cards must consume the available portrait height")
      try capture("portrait")
      return
    }

    func assertArrivalWeather(_ orientation: String) {
      let weather = el("home-arrival-weather")
      XCTAssertTrue(weather.waitForExistence(timeout: 30), "Apple Weather did not provide inline arrival weather in \(orientation)")
      XCTAssertTrue(weather.label.lowercased().contains("arrival weather"), "inline arrival weather is missing its accessible label in \(orientation): \(weather.label)")
      XCTAssertTrue(weather.label.lowercased().contains("degrees celsius"), "inline arrival weather is missing its temperature in \(orientation): \(weather.label)")
      XCTAssertFalse(text("Weather unavailable · MEL").exists, "Home must not add a separate unavailable-weather row")
    }

    XCUIDevice.shared.orientation = .landscapeLeft
    let dashboard = wait("home-landscape-dashboard")
    let trip = wait("home-next-trip")
    let quick = wait("home-quick-actions")
    let explore = wait("home-explore")
    XCTAssertLessThan(trip.frame.maxX, quick.frame.minX, "Upcoming Trip and Quick actions must share one horizontal strip")
    XCTAssertGreaterThan(explore.frame.minY, dashboard.frame.maxY, "Explore destinations must fill the row below the dashboard strip")
    assertArrivalWeather("landscape")
    try capture("landscape")

    if device == "air" {
      XCUIDevice.shared.orientation = .portrait
      wait("home-next-trip")
      XCTAssertFalse(el("home-landscape-dashboard").exists, "iPhone Air portrait must keep the compact Home layout")
      assertArrivalWeather("portrait")
      try capture("portrait")

      XCTAssertFalse(el("dest-weather").exists, "Home destination thumbnails must not render weather")
      let destination = wait("dest-HKG")
      destination.tap()
      let cityWeather = el("dest-weather")
      XCTAssertTrue(cityWeather.waitForExistence(timeout: 30), "Apple Weather did not provide weather after opening the destination card")
      XCTAssertTrue(cityWeather.label.lowercased().contains("degrees celsius"), "opened destination weather is missing its temperature: \(cityWeather.label)")
      XCTAssertTrue(el("dest-weather-attribution").exists, "opened destination weather is missing Apple Weather attribution")
      try capture("destination")
    }
  }

  /// Universal iPad build: real PR login, rotation, native modal, and TG switch.
  /// Run only this test on an iPad; existing Duo tests keep their own setup.
  func testIPadHomeKeepsPortraitPanelsContentSized() throws {
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["IPAD_SHOT_DIR"])
    func capture(_ orientation: String) throws {
      let url = URL(fileURLWithPath: directory).appendingPathComponent("ipad-home-fit-\(orientation)-Ver1.png")
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: url)
    }
    XCUIDevice.shared.orientation = .portrait
    try signInAsPR("473006", usePrefilledPassword: true)
    XCUIDevice.shared.orientation = .landscapeLeft
    let explore = wait("home-explore")
    XCTAssertGreaterThan(explore.frame.height, 200)
    try capture("landscape")

    XCUIDevice.shared.orientation = .portrait
    let trip = wait("home-next-trip")
    let portraitExplore = wait("home-explore")
    let quickActions = wait("home-ipad-quick-row")
    XCTAssertLessThan(trip.frame.height, 260, "The trip ticket must not fill the portrait iPad viewport")
    XCTAssertLessThan(portraitExplore.frame.height, 260, "The destination panel must remain content-sized")
    XCTAssertGreaterThan(quickActions.frame.minY, max(trip.frame.maxY, portraitExplore.frame.maxY), "Quick actions should follow the two compact panels")
    try capture("portrait")
  }

  func testIPadPRDestinationLandmarks() throws {
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["IPAD_SHOT_DIR"])
    let version = ProcessInfo.processInfo.environment["IPAD_SHOT_VERSION"] ?? "1"
    func capture(_ name: String) throws {
      try XCUIScreen.main.screenshot().pngRepresentation.write(to:
        URL(fileURLWithPath: directory).appendingPathComponent("ipad-landmark-\(name)-Ver\(version).png"))
    }
    func signOut() {
      wait("tab-profile").tap()
      let add = el("profile-add-airline")
      if add.exists { add.tap() } else { wait("profile-logout").tap() }
      tapDialogConfirm("profile-dialog")
      wait("login-screen", 60)
    }
    if el("tab-profile").waitForExistence(timeout: 15) { signOut() }
    for (id, code, city) in [("465800", "SEA", "Seattle"), ("540753", "DOH", "Doha"),
                             ("563044", "DAD", "Da Nang"), ("532510", "RUH", "Riyadh"),
                             ("452320", "SIN", "Singapore")] {
      XCUIDevice.shared.orientation = .portrait
      try signInAsPR(id, usePrefilledPassword: true)
      wait("tab-profile").tap()
      XCTAssertTrue(text(id).waitForExistence(timeout: 10))
      wait("tab-home").tap()
      XCUIDevice.shared.orientation = .landscapeLeft
      let tile = wait("dest-\(code)")
      for _ in 0..<6 {
        if tile.isHittable { break }
        el("home-explore-strip").swipeLeft()
      }
      tile.tap()
      XCTAssertEqual(wait("dest-city").label, city)
      wait("dest-photo-\(code)")
      wait("dest-photo-pane-wide")
      sleep(1)
      try capture("\(code)-landscape")
      XCUIDevice.shared.orientation = .portrait
      XCTAssertEqual(wait("dest-city").label, city)
      sleep(1)
      try capture("\(code)-portrait")
      wait("dest-trip-details").tap()
      wait("page-trip-details")
      wait("page-back").tap()
      wait("dest-back").tap()
      signOut()
    }
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    wait("login-btn").tap()
    wait("home-screen", 200)
    wait("tab-profile").tap()
    XCTAssertTrue(text("35459").waitForExistence(timeout: 10))
    XCTAssertTrue(wait("profile-provider-chip").label.lowercased().contains("thai"))
    XCTAssertFalse(text("452320").exists)
    try capture("TG-profile")
  }

  func testIPadPR473006AndTGAccountSwitch() throws {
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["IPAD_SHOT_DIR"])
    func capture(_ name: String) throws {
      let version = ProcessInfo.processInfo.environment["IPAD_SHOT_VERSION"] ?? "1"
      let url = URL(fileURLWithPath: directory).appendingPathComponent("ipad-\(name)-Ver\(version).png")
      // App-only captures crop with stale portrait bounds after iPad rotation.
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: url)
    }
    XCUIDevice.shared.orientation = .portrait
    try signInAsPR("473006", usePrefilledPassword: true)
    XCUIDevice.shared.orientation = .landscapeLeft
    XCTAssertGreaterThanOrEqual(appFrame.width, 700)
    let prDashboard = wait("home-landscape-dashboard")
    let prTrip = wait("home-next-trip")
    let prQuick = wait("home-quick-actions")
    let prExplore = wait("home-explore")
    XCTAssertLessThan(prTrip.frame.maxX, prQuick.frame.minX, "iPad landscape must place Upcoming Trip beside Quick actions")
    XCTAssertGreaterThan(prExplore.frame.minY, prDashboard.frame.maxY, "iPad landscape must place Explore below the dashboard strip")
    XCTAssertFalse(text("Weather unavailable · MEL").exists, "Home must not add a separate unavailable-weather row")
    XCTAssertTrue(text("Quick actions").exists, "Landscape keeps Quick actions beside the trip")
    try capture("pr-home-landscape")
    // Trip Details: the duty band and sector pass render on the iPad layout.
    wait("home-next-trip").tap()
    wait("page-trip-details")
    XCTAssertTrue(wait("duty-band-0").exists)
    XCTAssertTrue(wait("flight-pass-0").exists)
    XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "TG[0-9]{2,4}")).count, 0,
                   "TG sector leaked into the PR account")
    try capture("pr-trip-timeline")
    wait("page-back").tap()
    wait("tab-schedule").tap()
    wait("sched-view-rail")
    wait("sched-title")
    try capture("pr-schedule-landscape")
    wait("sched-view-calendar").tap()
    wait("cal-month-detail")
    wait("cal-compact")
    try capture("pr-calendar-landscape")
    wait("sched-view-route").tap()
    wait("route-map")
    wait("route-stats")
    try capture("pr-route-landscape")
    wait("tab-profile").tap()
    XCTAssertTrue(text("473006").waitForExistence(timeout: 10))
    wait("profile-wide")
    XCTAssertLessThanOrEqual(wait("profile-avatar").frame.width, 64)
    XCTAssertLessThan(wait("profile-id-card").frame.height, 240)
    try capture("pr-profile-landscape")
    wait("profile-avatar").tap()
    XCTAssertLessThanOrEqual(wait("profile-avatar-picker").frame.width, 520)
    try capture("pr-avatar-picker-landscape")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.5)).tap()
    wait("tab-home").tap()
    wait("qa-duty-swap").tap()
    if el("swap-disclaimer").waitForExistence(timeout: 3) {
      tapDialogConfirm("swap-disclaimer")
    }
    wait("duty-swap-host", 60)
    wait("search-form", 60)
    try capture("pr-duty-swap-landscape")
    wait("page-back").tap()
    XCUIDevice.shared.orientation = .portrait
    wait("tab-home").tap()
    wait("home-wide-row-1")
    XCTAssertGreaterThan(appFrame.height, appFrame.width)
    let portraitTrip = wait("home-next-trip")
    let portraitExplore = wait("home-explore")
    let portraitQuickActions = wait("home-ipad-quick-row")
    XCTAssertLessThan(portraitTrip.frame.height, 260)
    XCTAssertLessThan(portraitExplore.frame.height, 260)
    XCTAssertGreaterThan(portraitQuickActions.frame.minY, max(portraitTrip.frame.maxY, portraitExplore.frame.maxY))
    try capture("pr-home-portrait")
    // The destination strip is data-driven per crew; any published tile opens
    // the same Destination page (the old SYD-only tap assumed one roster).
    let destTile = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier MATCHES %@", "dest-[A-Z]{3}")).firstMatch
    XCTAssertTrue(destTile.waitForExistence(timeout: 20), "no destination tile on Home")
    destTile.tap()
    wait("page-destination")
    try capture("pr-destination-portrait")
    wait("dest-trip-details").tap()
    wait("page-trip-details")
    try capture("pr-trip-details-portrait")
    wait("page-back").tap()
    wait("dest-back").tap()
    wait("tab-profile").tap()
    XCTAssertLessThanOrEqual(wait("profile-avatar").frame.width, 64)
    try capture("pr-profile-portrait")
    wait("tab-schedule").tap()
    wait("sched-view-calendar").tap()
    wait("cal-month-detail")
    wait("cal-compact")
    XCTAssertGreaterThanOrEqual(wait("sched-view-rail").frame.minY, 24, "toolbar overlaps iPad status bar")
    try capture("pr-calendar-portrait")
    XCUIDevice.shared.orientation = .portraitUpsideDown
    wait("tab-profile").tap()
    wait("profile-logout").tap()
    wait("profile-dialog")
    XCTAssertEqual(XCUIDevice.shared.orientation, .portraitUpsideDown)
    try capture("pr-modal-upside-down")
    tapDialogConfirm("profile-dialog")
    wait("login-screen", 60)
    XCUIDevice.shared.orientation = .landscapeLeft
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    let tgCrew = try XCTUnwrap(wait("crew-id").value as? String)
    let tgPassword = try XCTUnwrap(
      ProcessInfo.processInfo.environment["DUO_TG_PASSWORD"],
      "set DUO_TG_PASSWORD from local secure storage"
    )
    XCTAssertFalse(tgCrew.isEmpty)
    XCTAssertNotEqual(tgCrew, "473006")
    replaceText(wait("crew-pw"), with: tgPassword)
    XCTAssertFalse((el("crew-pw").value as? String ?? "").isEmpty, "TG password is empty")
    wait("login-btn").tap()
    wait("home-screen", 200)
    wait("home-greeting")
    let notNow = app.buttons["Not Now"]
    if notNow.waitForExistence(timeout: 3) { notNow.tap() }
    XCTAssertFalse(app.alerts["Save Password?"].exists, "system password sheet still covers TG Home")
    XCTAssertGreaterThanOrEqual(appFrame.width, 700)
    let tgDashboard = wait("home-landscape-dashboard")
    let tgTrip = wait("home-next-trip")
    let tgQuick = wait("home-quick-actions")
    let tgExplore = wait("home-explore")
    XCTAssertLessThan(tgTrip.frame.maxX, tgQuick.frame.minX, "TG iPad Home must keep Upcoming Trip beside Quick actions")
    XCTAssertGreaterThan(tgExplore.frame.minY, tgDashboard.frame.maxY, "TG iPad Home must keep Explore below the dashboard strip")
    try capture("tg-home-landscape")
    // Trip Details as TG: its current Home trip must carry TG sectors only.
    tgTrip.tap()
    wait("page-trip-details")
    XCTAssertTrue(wait("duty-band-0").exists)
    XCTAssertTrue(wait("flight-pass-0").exists)
    XCTAssertGreaterThan(app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "TG[0-9]{2,4}")).count, 0,
                         "TG sector missing")
    XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "PR[0-9]{2,4}")).count, 0,
                   "PR sector leaked into the TG account")
    try capture("tg-trip-timeline")
    wait("page-back").tap()
    wait("tab-profile").tap()
    XCTAssertFalse(text("473006").exists, "PR identity leaked into TG")
    XCTAssertTrue(text(tgCrew).waitForExistence(timeout: 10))
    XCTAssertTrue(wait("profile-provider-chip").label.lowercased().contains("thai"))
    try capture("tg-profile-landscape")
  }

  func testDuoInnerScreenWideLayoutsWithK1001() throws {
    try XCTSkipIf(ProcessInfo.processInfo.environment["DUO_ORIENTATION"] == "portrait", "wide-layout assertions are for landscape")
    signInAsK1001()
    let frame = appFrame
    XCTAssertGreaterThanOrEqual(frame.width, 700, "not on the Duo inner (wide) screen: \(frame)")

    // Home: next trip (K1001's EK roster) in the left column, dock centred.
    let trip = wait("home-next-trip", 60)
    XCTAssertTrue(text("EK").waitForExistence(timeout: 10), "next EK flight not shown on Home")
    XCTAssertLessThan(trip.frame.maxX, frame.midX + 20, "trip card should sit in the left column")
    let dockHome = wait("tab-home")
    XCTAssertGreaterThan(dockHome.frame.minX, 120, "dock should be centred, not full width")
    shot("01_home")

    // Trip details: legs left, calendar + hotel right.
    trip.tap()
    wait("page-trip-details")
    let calendarRow = wait("trip-calendar-toggle")
    XCTAssertGreaterThan(calendarRow.frame.minX, frame.midX - 20, "calendar should be in the right column")
    shot("02_trip_details")
    wait("page-back").tap()

    // Schedule ▸ route map: map half + details half.
    wait("tab-schedule").tap()
    wait("sched-title")
    sleep(2) // let the date strip finish rendering on the slow simulator
    shot("03_schedule")
    XCTAssertTrue(el("sched-grid").exists, "Schedule should be strip + two-column cards on the wide layout")
    XCTAssertTrue(el("sched-view-rail").exists, "roster views should sit in the right-side toolbar")
    wait("sched-view-route").tap()
    let map = wait("route-map")
    let details = wait("route-stats")
    XCTAssertLessThan(map.frame.maxX, details.frame.minX + 1, "map must be left of the details")
    XCTAssertEqual(map.frame.width, details.frame.width, accuracy: 40, "route map and details should split ~50/50")
    shot("04_route_map")
    wait("sched-view-calendar").tap()
    wait("cal-grid")
    XCTAssertTrue(el("cal-month-detail").exists, "Calendar month grid missing on the wide layout")
    shot("05_calendar")

    // R'Bot: back chevron on the LEFT on the wide layout.
    wait("dock-rbot").tap()
    let back = wait("rbot-close")
    XCTAssertLessThan(back.frame.midX, frame.midX, "R'Bot back button should be on the left")
    XCTAssertTrue(el("rbot-context").exists, "R'Bot should show the context panel on the wide layout")
    shot("06_rbot")
    back.tap()

    // Profile: Log Out must be reachable (not hidden behind the dock).
    wait("tab-profile").tap()
    XCTAssertTrue(text(crewId).waitForExistence(timeout: 10), "Profile should show crew \(crewId)")
    shot("07_profile")
    let logout = wait("profile-logout")
    XCTAssertLessThan(logout.frame.maxY, dockHome.frame.minY, "Log Out is hidden behind the dock")
  }

  // MARK: Profile — fills the inner screen (PR crew 392923)

  /// Landscape: title across the top, identity + block hours + Log Out left, the
  /// settings card right — both columns end level above the dock, no dead half.
  /// Portrait keeps the single centred column.
  func testDuoProfilePR392923() throws {
    try signInAsPR("392923")
    let portrait = ProcessInfo.processInfo.environment["DUO_ORIENTATION"] == "portrait"
    let dock = wait("tab-home")
    wait("tab-profile").tap()
    let logout = wait("profile-logout")
    XCTAssertLessThan(logout.frame.maxY, dock.frame.minY, "Log Out is hidden behind the dock")
    if portrait {
      wait("profile-tall")
      shot("p01_profile")
      return
    }
    wait("profile-wide")
    let id = wait("profile-id-card")
    let help = wait("row-help")
    let personal = wait("row-personal")
    XCTAssertLessThan(id.frame.maxX, personal.frame.minX, "identity left of the settings")
    // Both columns run to the same bottom edge (Log Out | last settings row).
    XCTAssertEqual(logout.frame.maxY, help.frame.maxY, accuracy: 24, "columns should end level")
    // No dead half: the columns reach down to just above the dock.
    XCTAssertGreaterThan(logout.frame.maxY, dock.frame.minY - 80, "page stops short of the dock")
    shot("p01_profile")
  }

  /// A roster view: one tap on the wide layout's toolbar, through the menu otherwise.
  private func pickView(_ id: String) {
    if el("sched-view-menu").exists { wait("sched-view-menu").tap() }
    wait(id).tap()
  }

  /// Schedule as PR crew 392923: the date strip on top in both orientations;
  /// landscape adds two card columns and the roster views as a right-side toolbar,
  /// and the route map is framed on the crew's base (MNL).
  func testDuoSchedulePR392923() throws {
    try signInAsPR("392923")
    let portrait = ProcessInfo.processInfo.environment["DUO_ORIENTATION"] == "portrait"
    wait("tab-schedule").tap()
    let title = wait("sched-title")
    sleep(2) // let the strip seat on today
    let chip = wait("day-8")
    XCTAssertLessThan(chip.frame.minY, title.frame.maxY + 120, "the date strip should sit right under the title")
    if portrait {
      XCTAssertTrue(el("sched-list").exists)
      XCTAssertFalse(el("sched-view-rail").exists, "portrait keeps the menu")
      shot("s01_schedule")
      pickView("sched-view-route"); _ = wait("route-map"); sleep(1)
      shot("s02_route")
      return
    }
    let grid = wait("sched-grid")
    let rail = wait("sched-view-rail")
    XCTAssertFalse(el("sched-view-menu").exists, "wide has the toolbar, not the menu")
    XCTAssertGreaterThan(rail.frame.minX, grid.frame.maxX - 1, "toolbar right of the cards")
    // On the right edge, in the status strip under the clock (like iOS 27's own apps).
    XCTAssertGreaterThan(rail.frame.midX, appFrame.maxX - 84, "toolbar should sit in the right-edge strip")
    XCTAssertGreaterThan(rail.frame.minY, title.frame.maxY, "toolbar sits below the clock, not beside the title")
    shot("s01_schedule")
    wait("sched-view-route").tap()
    let map = wait("route-map")
    XCTAssertGreaterThan(rail.frame.minX, map.frame.maxX, "toolbar stays beside the map")
    sleep(1)
    shot("s02_route")
    wait("sched-view-calendar").tap(); _ = wait("cal-month-detail"); sleep(1)
    shot("s03_calendar")
    wait("sched-view-timeline").tap(); _ = wait("sched-grid")
  }

  /// Home ▸ Meal (demo, stored on the phone) and Trip details ▸ the per-leg ops grid,
  /// as PR crew 392923, on whichever Duo orientation the runner set.
  func testDuoMealAndTripOpsPR392923() throws {
    try signInAsPR("392923")
    // Meal: pick Halal, widen the range by a day, save, see the saved row.
    wait("qa-meal").tap()
    wait("page-meal")
    wait("meal-type").tap()
    wait("meal-option-MOML").tap()
    wait("meal-to-inc").tap()
    wait("meal-save").tap()
    tapDialogConfirm("meal-dialog", single: true)
    XCTAssertTrue(el("meal-dialog").waitForNonExistence(timeout: 5), "Got it should close the dialog")
    let saved = wait("meal-saved-0")
    XCTAssertTrue(saved.label.contains("MOML") || saved.label.contains("halal") || saved.label.contains("Muslim"), "saved row should name the meal: \(saved.label)")
    shot("m01_meal")
    wait("page-back").tap()
    // Trip details: the duty band, then the sector pass matrix under it.
    wait("home-next-trip").tap()
    wait("page-trip-details")
    let band = wait("duty-band-0")
    XCTAssertGreaterThan(band.frame.height, 60, "duty band should carry report + FDP/DP/BLOCK")
    let pass = el("flight-pass-0")
    XCTAssertTrue(pass.waitForExistence(timeout: 10), "sector pass missing on Trip details")
    // Trip details has no dock: scroll until the whole pass is on screen.
    for _ in 0..<6 where !(pass.frame.maxY < appFrame.maxY - 20) { app.swipeUp() }
    for r in 0..<2 {
      XCTAssertTrue(el("flight-ops-row-0-\(r)").exists, "pass ops row \(r) missing")
    }
    for id in ["ops-std-0", "ops-gate-0", "ops-belt-0"] {
      XCTAssertFalse(el(id).label.isEmpty, "\(id) has no value")
    }
    // Ops values sit inside the pass: two rows of four, each a single line.
    for ids in [["ops-etd-0", "ops-atd-0", "ops-eta-0", "ops-ata-0"],
                ["ops-boarding-0", "ops-door-0", "ops-offblock-0", "ops-block-0"]] {
      let cells = ids.map { el($0) }
      for cell in cells { XCTAssertFalse(cell.label.isEmpty, "ops cell has no value") }
      for cell in cells[1...] {
        XCTAssertLessThan(abs(cell.frame.midY - cells[0].frame.midY), 12, "ops values should share one row")
      }
    }
    // No duplicates: STD and the gate read only in the pass.
    XCTAssertFalse(app.staticTexts["Arrival gate"].exists, "old gate row still shown")
    // Per leg: each pass shows STD once (a two-leg trip shows two passes).
    XCTAssertEqual(pass.staticTexts.matching(NSPredicate(format: "label == 'STD'")).count, 1, "STD should read once on the pass")
    shot("m02_trip_ops")
  }

  /// The shared dock/rail hides Global for both airlines and keeps account identity isolated.
  func testGlobalTabHiddenBothAirlines() throws {
    let device = ProcessInfo.processInfo.environment["NAV_DEVICE"] ?? "air"
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["NAV_SHOT_DIR"])
    func capture(_ airline: String) throws {
      let name = "global-tab-hidden-\(device)-\(airline)-Ver1"
      if device == "duo" { shot(name) }
      else {
        try XCUIScreen.main.screenshot().pngRepresentation.write(to:
          URL(fileURLWithPath: directory).appendingPathComponent(name + ".png"))
      }
    }
    func assertNavigation(crewId: String, carrier: String, previousCrewId: String?) throws {
      wait("home-screen", 120)
      XCTAssertFalse(el("tab-global").exists, "Global tab must stay hidden for \(carrier)")
      for id in ["tab-home", "tab-schedule", "tab-profile"] {
        XCTAssertTrue(el(id).exists, "\(id) missing for \(carrier)")
      }
      wait("tab-profile").tap()
      wait("profile-screen")
      XCTAssertTrue(text(crewId).waitForExistence(timeout: 10), "\(carrier) crew identity missing")
      XCTAssertTrue(wait("profile-provider-chip").label.lowercased().contains(carrier.lowercased()))
      if let previousCrewId { XCTAssertFalse(text(previousCrewId).exists, "previous crew identity leaked") }
      XCTAssertFalse(el("tab-global").exists, "Global tab appeared on the \(carrier) profile")
      try capture(carrier.lowercased())
    }

    try signInAsPR("433535", usePrefilledPassword: true)
    try assertNavigation(crewId: "433535", carrier: "Philippine", previousCrewId: "35459")

    wait("profile-logout").tap()
    tapDialogConfirm("profile-dialog")
    wait("login-screen", 60)
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    XCTAssertEqual(el("crew-id").value as? String, "35459")
    XCTAssertFalse((el("crew-pw").value as? String ?? "").isEmpty, "password is empty")
    wait("login-btn").tap()
    let deadline = Date().addingTimeInterval(200)
    let useRosterAfter = Date().addingTimeInterval(20)
    while !el("home-screen").exists && Date() < deadline {
      if el("portal-login-error").exists {
        XCTAssertEqual(el("portal-login-identity").label, "35459", "submitted crew ID differs from requested ID")
        XCTFail("portal rejected the TG login; stop and inspect the response")
        return
      }
      let useRoster = el("use-captured-roster")
      if Date() > useRosterAfter && useRoster.exists && useRoster.isEnabled && useRoster.isHittable {
        useRoster.tap()
      }
      Thread.sleep(forTimeInterval: 0.5)
    }
    try assertNavigation(crewId: "35459", carrier: "Thai", previousCrewId: "433535")
  }

  /// Trip Details duty timeline on the unfolded Duo, PR then TG on the same phone:
  /// each carrier renders its own sectors and duty band, with no PR/TG mixing.
  func testDuoTripTimelineBothAirlines() throws {
    let tag = layoutClass == .wide ? "wide" : "tall"
    func sector(_ pattern: String) -> XCUIElementQuery {
      app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", pattern))
    }
    func openTimeline(_ name: String) {
      wait("home-next-trip").tap()
      wait("page-trip-details")
      XCTAssertTrue(el("duty-band-0").waitForExistence(timeout: 10), "duty band missing on Trip details")
      XCTAssertTrue(el("flight-pass-0").waitForExistence(timeout: 10), "sector pass missing on Trip details")
      XCTAssertTrue(text("FDP").waitForExistence(timeout: 5), "duty totals missing")
      shot(name)
    }

    // PR first: its own MNL sectors only, with Global hidden from navigation.
    try signInAsPR("433535", usePrefilledPassword: true)
    XCTAssertFalse(el("tab-global").exists, "Global tab must stay hidden for PR")
    XCTAssertTrue(el("tab-home").exists && el("tab-schedule").exists && el("tab-profile").exists)
    openTimeline("tt_\(tag)_pr")
    XCTAssertGreaterThan(sector("PR[0-9]{2,4}").count, 0, "PR sector missing")
    XCTAssertEqual(sector("TG[0-9]{2,4}").count, 0, "TG sector leaked into the PR account")
    wait("page-back").tap()

    // Switch to TG through the real Profile flow (portal roster import included).
    wait("tab-profile").tap()
    let add = el("profile-add-airline")
    if add.exists { add.tap() } else { wait("profile-logout").tap() }
    tapDialogConfirm("profile-dialog")
    wait("login-screen", 60)
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    XCTAssertEqual(el("crew-id").value as? String, "35459")
    XCTAssertFalse((el("crew-pw").value as? String ?? "").isEmpty, "password is empty")
    wait("login-btn").tap()
    let deadline = Date().addingTimeInterval(200)
    let useRosterAfter = Date().addingTimeInterval(20)
    while !el("home-screen").exists && Date() < deadline {
      if el("portal-login-error").exists {
        XCTAssertEqual(el("portal-login-identity").label, "35459", "submitted crew ID differs from requested ID")
        XCTFail("portal rejected the TG login; stop and inspect the response")
        return
      }
      let useRoster = el("use-captured-roster")
      if Date() > useRosterAfter && useRoster.exists && useRoster.isEnabled && useRoster.isHittable {
        useRoster.tap()
      }
      Thread.sleep(forTimeInterval: 0.5)
    }
    wait("home-screen", 120)
    XCTAssertFalse(el("tab-global").exists, "Global tab must stay hidden after switching to TG")
    XCTAssertTrue(el("tab-home").exists && el("tab-schedule").exists && el("tab-profile").exists)

    // TG's published roster is already past, so Home has no "next trip" card:
    // open Trip Details from the Schedule tab, the real entry point for it.
    wait("tab-schedule").tap()
    wait("sched-title")
    let anyDuty = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'duty-TG'")).firstMatch
    if !anyDuty.waitForExistence(timeout: 3) { wait("sched-prev-month").tap() }
    for _ in 0..<10 where !anyDuty.exists { app.swipeUp() }
    XCTAssertTrue(anyDuty.waitForExistence(timeout: 10), "no TG duty row in the schedule")
    anyDuty.tap()
    wait("page-trip-details")
    XCTAssertTrue(el("duty-band-0").waitForExistence(timeout: 10), "duty band missing on Trip details")
    XCTAssertTrue(el("flight-pass-0").waitForExistence(timeout: 10), "sector pass missing on Trip details")
    XCTAssertTrue(text("FDP").waitForExistence(timeout: 5), "duty totals missing")
    shot("tt_\(tag)_tg")
    XCTAssertGreaterThan(sector("TG[0-9]{2,4}").count, 0, "TG sector missing")
    XCTAssertEqual(sector("PR[0-9]{2,4}").count, 0, "PR sector leaked into the TG account")
    wait("page-back").tap()
  }

  /// Duty Swap ▸ Search pairing: the ✕ left of the star closes the filters back to
  /// the matrix, and R'Bot's starter suggestions are one-line pills (not panel-high cards).
  func testDuoSwapCloseAndRbotPillsPR392923() throws {
    try signInAsPR("392923")
    let tag = layoutClass == .wide ? "wide" : "tall"
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 30) { tapDialogConfirm("swap-disclaimer") }
    _ = wait("search-form", 60)
    XCTAssertTrue(text("Preview ·").waitForExistence(timeout: 60), "preview header missing")
    let close = wait("search-close", 30)
    let star = wait("search-save")
    XCTAssertLessThanOrEqual(close.frame.maxX, star.frame.minX, "✕ should sit left of the star")
    XCTAssertEqual(close.frame.midY, star.frame.midY, accuracy: 2, "✕ and star share one row")

    wait("search-ask-rbot").tap()
    _ = wait("swap-rbot-panel", 10)
    let pills = app.descendants(matching: .any).matching(identifier: "swap-rbot-suggestion")
    XCTAssertGreaterThanOrEqual(pills.count, 2, "starter suggestions missing")
    for i in 0..<pills.count {
      XCTAssertLessThan(pills.element(boundBy: i).frame.height, 40, "suggestion \(i) is not a pill: \(pills.element(boundBy: i).frame)")
    }
    sleep(1)
    shot("c01_rbot_pills_\(tag)")
    wait("swap-rbot-close").tap()

    wait("search-close").tap()
    _ = wait("crew-matrix", 60)
    XCTAssertFalse(el("search-form").exists, "✕ should close the filters")
    sleep(2)
    shot("c02_closed_to_matrix_\(tag)")
    // The filter chips reopen the form.
    wait("swap-filters").tap()
    _ = wait("search-form", 10)
  }

  /// Home ▸ Check-In as PR 421983: the portal's next task (14 Oct, 15:15 → 22:44,
  /// scheduled 17:15, PR684 MNL→DOH), the countdown, the map and the disabled button.
  func testDuoCheckInPR421983() throws {
    try signInAsPR("421983")
    let tag = layoutClass == .wide ? "wide" : "tall"
    wait("qa-check-in", 30).tap()
    _ = wait("page-checkin")
    let earliest = wait("checkin-earliest", 90)
    XCTAssertEqual(earliest.label, "15:15L")
    XCTAssertEqual(wait("checkin-latest").label, "22:44L")
    XCTAssertTrue(wait("checkin-scheduled").label.contains("17:15"))
    XCTAssertTrue(wait("checkin-day").label.contains("14"), "day: \(el("checkin-day").label)")
    XCTAssertTrue(wait("checkin-duty-0").label.contains("PR684") || text("PR684").exists, "PR684 duty row missing")
    XCTAssertTrue(wait("checkin-map").exists)
    XCTAssertTrue(wait("checkin-native-map").exists, "street map missing")
    XCTAssertEqual(wait("checkin-location-label").label, "CHECK-IN POINT", "portal check-in location missing")
    XCTAssertFalse(el("checkin-crew-label").exists, "a demo crew location must not be presented as live")
    XCTAssertFalse(wait("checkin-button").isEnabled, "before 15:15 Manila the button must be disabled")
    XCTAssertTrue(wait("checkin-countdown").label.range(of: #"^\d+:\d{2}:\d{2}$"#, options: .regularExpression) != nil,
                  "countdown: \(el("checkin-countdown").label)")
    if layoutClass == .wide {
      let map = wait("checkin-map")
      let times = wait("checkin-times")
      XCTAssertGreaterThan(map.frame.minX, times.frame.maxX - 1, "map should sit right of the times")
      XCTAssertEqual(map.frame.maxY, times.frame.maxY, accuracy: 8, "map and timing cards should align at the bottom")
      XCTAssertGreaterThan(wait("checkin-duty-0").frame.minY, map.frame.maxY, "duty should span below the aligned cards")
    }
    sleep(2)
    shot("k01_checkin_\(tag)")
  }

  // MARK: Duty Swap — PR crew 392923 on the PR TEST portal

  /// Fallback for legacy dialogs whose actions are not independently exposed.
  /// New AppDialog flows should tap their explicit `<testID>-confirm` control.
  /// `single`: a one-button dialog ("Got it") has its pill centred.
  private func tapDialogConfirm(_ dialog: String, single: Bool = false, file: StaticString = #filePath, line: UInt = #line) {
    let card = el(dialog)
    XCTAssertTrue(card.waitForExistence(timeout: 15), "\(dialog) did not appear", file: file, line: line)
    // ~42 pt above the card bottom, whatever the message length.
    card.coordinate(withNormalizedOffset: CGVector(dx: single ? 0.5 : 0.66, dy: 1)).withOffset(CGVector(dx: 0, dy: -42)).tap()
  }

  /// Ends on Home signed in as PR crew `id`. The password comes from the runner's
  /// environment (TEST_RUNNER_DUO_PR_PASSWORD), never from this file.
  private func signInAsPR(_ id: String, usePrefilledPassword: Bool = false) throws {
    if el("home-screen").waitForExistence(timeout: 25) {
      el("tab-profile").tap()
      if text(id).waitForExistence(timeout: 5) {
        el("tab-home").tap()
        return
      }
      let addAirline = el("profile-add-airline")
      if addAirline.exists { addAirline.tap() } else { wait("profile-logout").tap() }
      wait("profile-dialog-confirm").tap()
    }
    let pw = try XCTUnwrap(ProcessInfo.processInfo.environment["DUO_PR_PASSWORD"], "set DUO_PR_PASSWORD from local secure storage")
    wait("login-screen", 60)
    el("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Philippine")
    wait("airline-PR").tap()
    replaceText(wait("crew-id"), with: id)
    replaceText(wait("crew-pw"), with: pw)
    if usePrefilledPassword {
      // iPad's number pad covers the login pill in portrait; dismiss it using
      // the system keyboard control before tapping the app's button.
      let hideKeyboard = app.buttons["Hide keyboard"]
      if hideKeyboard.waitForExistence(timeout: 3) && hideKeyboard.isHittable { hideKeyboard.tap() }
      let isIPadRun = ProcessInfo.processInfo.environment["IPAD_SHOT_DIR"] != nil
        || ProcessInfo.processInfo.environment["ANALYZER_DEVICE"] == "ipad"
      if !el("login-btn").isHittable && isIPadRun {
        // Floating iPad number pad has no hittable Hide keyboard control.
        // Tapping non-interactive content dismisses it through the ScrollView.
        app.staticTexts["ALWAYS A WAY FORWARD"].tap()
      }
    }
    // Keyboard dismissal must not append digits to the prefilled ID.
    XCTAssertEqual(el("crew-id").value as? String, id, "crew ID changed while dismissing keyboard")
    XCTAssertFalse((el("crew-pw").value as? String ?? "").isEmpty, "password is empty")
    let loginButton = el("login-btn")
    XCTAssertTrue(loginButton.waitForExistence(timeout: 5) && loginButton.isHittable, "login button remained covered after keyboard dismissal")
    loginButton.tap()
    // The portal fallback can capture a roster and ask the user to accept it
    // instead of returning automatically. Drive that existing UI when offered.
    let homeDeadline = Date().addingTimeInterval(200)
    let autoImportDeadline = Date().addingTimeInterval(20)
    while !el("home-screen").exists && Date() < homeDeadline {
      if el("portal-login-error").exists {
        XCTAssertEqual(el("portal-login-identity").label, id, "submitted crew ID differs from requested ID")
        XCTFail("portal rejected this crew login; stop and inspect the response")
        return
      }
      let useRoster = el("use-captured-roster")
      if ProcessInfo.processInfo.environment["CALENDAR_REQUIRE_AUTO_IMPORT"] != "1" && Date() > autoImportDeadline && useRoster.exists && useRoster.isEnabled && useRoster.isHittable {
        useRoster.tap()
        break
      }
      Thread.sleep(forTimeInterval: 0.5)
    }
    // Accepting a captured roster still performs its import; a busy simulator
    // can need longer than 30 seconds before Home mounts.
    wait("home-screen", 120)
    let notNow = app.buttons["Not Now"]
    if notNow.waitForExistence(timeout: 3) { notNow.tap() }
    let dismiss = app.buttons["Dismiss"]
    if dismiss.waitForExistence(timeout: 3) { dismiss.tap() }
  }

  /// A date-only follow-up on Search pairing must stay grounded in this screen's
  /// visible window, including while the portal is still loading crew rows.
  func testDutySwapRbotKnowsSearchScreen() throws {
    try signInAsPR("392923", usePrefilledPassword: true)
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 30) { tapDialogConfirm("swap-disclaimer") }
    wait("search-form", 60)
    XCTAssertTrue(text("09 Oct 2026").waitForExistence(timeout: 10), "expected the 09 Oct search window")
    wait("search-ask-rbot").tap()
    let input = wait("swap-rbot-input")
    input.tap()
    input.typeText("08 Oct")
    wait("swap-rbot-send").tap()
    let reply = wait("swap-rbot-assistant-1", 30).label
    XCTAssertTrue(reply.contains("Duty Swap · Search pairing"), reply)
    XCTAssertTrue(reply.contains("08 Oct is outside") && reply.contains("09 Oct–31 Oct"), reply)
    if let dir = ProcessInfo.processInfo.environment["RBOT_SHOT_DIR"] {
      let url = URL(fileURLWithPath: dir).appendingPathComponent("duty-swap-rbot-search-context-Ver1.png")
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: url)
    }
  }

  func testTGDutySwapOpensLiveForDefaultCrew() throws {
    if el("home-screen").waitForExistence(timeout: 15) {
      wait("tab-profile").tap()
      let add = el("profile-add-airline")
      if add.exists { add.tap() } else { wait("profile-logout").tap() }
      tapDialogConfirm("profile-dialog")
    }
    wait("login-screen", 60)
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    wait("login-btn").tap()
    wait("home-screen", 200)
    wait("qa-duty-swap").tap()
    wait("duty-swap-host", 60)
    XCTAssertTrue(el("search-form").waitForExistence(timeout: 60), "TG Duty Swap did not open its live Search pairing screen")
    XCTAssertTrue(text("Handshake").waitForExistence(timeout: 20), "TG did not use the portal-provided Handshake mode")
    let previewCount = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", #"Preview · [1-9][0-9]* crew"#)).firstMatch
    XCTAssertTrue(previewCount.waitForExistence(timeout: 120), "TG live preview did not return candidate crew")
    XCTAssertTrue(el("matrix-crew-25324").waitForExistence(timeout: 60), "known TG candidate 25324 did not render in the live preview")
    wait("search-submit").tap()
    XCTAssertTrue(el("crew-matrix").waitForExistence(timeout: 90), "TG candidate roster did not open")
    XCTAssertTrue(el("matrix-crew-25324").waitForExistence(timeout: 60), "known TG candidate 25324 did not render in the candidate roster")
    let candidateCount = wait("swap-crew-count", 30)
    XCTAssertTrue(candidateCount.waitForLabel(matching: #"^(?:[0-9]+–[0-9]+ of )?[1-9][0-9]* crew$"#, timeout: 30), "TG candidate count: \(candidateCount.label)")
    XCTAssertFalse(el("swap-error").exists, "TG candidate roster showed an error")
    XCTAssertFalse(el("page-swap").exists, "TG must not fall back to the Duty Swap preview")
    Thread.sleep(forTimeInterval: 2)
    let dismiss = app.buttons["Dismiss"]
    if dismiss.waitForExistence(timeout: 2) { dismiss.tap() }
    if let directory = ProcessInfo.processInfo.environment["TG_DUTY_SWAP_SHOT_DIR"] {
      let device = ProcessInfo.processInfo.environment["TG_DUTY_SWAP_DEVICE"] ?? "device"
      let version = ProcessInfo.processInfo.environment["TG_DUTY_SWAP_SHOT_VERSION"] ?? "1"
      let name = "tg-duty-swap-\(device)-Ver\(version)"
      if device == "duo" { shot(name) }
      else {
        let url = URL(fileURLWithPath: directory).appendingPathComponent("\(name).png")
        try XCUIScreen.main.screenshot().pngRepresentation.write(to: url)
      }
    }
  }

  /// TG Handshake puts compare details inside `mineTableRowTask` and
  /// `otherTableRowTask`. Match must still show airport chains in all four steps.
  /// Read-only: the final Send action is never tapped.
  func testTGMatchFlightRoutes() throws {
    func capture(_ name: String) throws {
      if let directory = ProcessInfo.processInfo.environment["TG_MATCH_ROUTES_SHOT_DIR"] {
        let url = URL(fileURLWithPath: directory).appendingPathComponent("\(name).png")
        try XCUIScreen.main.screenshot().pngRepresentation.write(to: url)
      } else {
        shot(name)
      }
    }
    if el("home-screen").waitForExistence(timeout: 15) {
      wait("tab-profile").tap()
      let add = el("profile-add-airline")
      if add.exists { add.tap() } else { wait("profile-logout").tap() }
      tapDialogConfirm("profile-dialog")
    }
    wait("login-screen", 60)
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    wait("login-btn").tap()
    wait("home-screen", 200)
    wait("qa-duty-swap").tap()
    wait("duty-swap-host", 60)
    wait("approach-ticket").tap()

    let mineRoute = NSPredicate(format: "label CONTAINS %@", "BKK–MEL–BKK")
    let theirRoute = NSPredicate(format: "label CONTAINS %@", "BKK–ARN–BKK")
    func route(_ predicate: NSPredicate, under root: XCUIElement? = nil) -> XCUIElement {
      (root ?? app).descendants(matching: .any).matching(predicate).firstMatch
    }

    // Give
    wait("ticket-give", 120)
    XCTAssertTrue(route(mineRoute).waitForExistence(timeout: 120), "Give does not show TG465/TG466's BKK–MEL–BKK route")
    try capture("tg-duty-swap-match-routes-01-give-Ver1")
    let give = app.descendants(matching: .any).matching(
      NSPredicate(format: "identifier BEGINSWITH 'ticket-give-' AND label CONTAINS 'TG465/TG466'")
    ).firstMatch
    XCTAssertTrue(give.waitForExistence(timeout: 30), "TG465/TG466 is missing from Give")
    give.tap()
    wait("ticket-next").tap()

    // Want
    wait("search-form", 30)
    XCTAssertTrue(route(mineRoute, under: wait("ticket-selected-give")).exists, "Want lost the BKK–MEL–BKK route")
    try capture("tg-duty-swap-match-routes-02-want-Ver1")
    wait("ticket-next").tap()

    // Pick
    let candidate = wait("ticket-match-34098", 180)
    XCTAssertTrue(route(theirRoute, under: candidate).waitForExistence(timeout: 180), "Pick does not show 34098's BKK–ARN–BKK route")
    try capture("tg-duty-swap-match-routes-03-pick-Ver1")
    candidate.tap()
    wait("ticket-next").tap()

    // Send
    wait("swap-ticket", 60)
    XCTAssertTrue(route(mineRoute, under: wait("ticket-selected-give")).exists, "Send lost the Give route")
    XCTAssertTrue(route(theirRoute, under: wait("ticket-selected-take")).exists, "Send lost the Take route")
    try capture("tg-duty-swap-match-routes-04-send-Ver1")
  }

  func testPRDutySwapStillOpensLive() throws {
    try signInAsPR("392923", usePrefilledPassword: true)
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 5) { tapDialogConfirm("swap-disclaimer") }
    wait("duty-swap-host", 60)
    XCTAssertTrue(el("search-form").waitForExistence(timeout: 60), "PR Duty Swap regression: Search pairing did not open")
    let dismiss = app.buttons["Dismiss"]
    if dismiss.waitForExistence(timeout: 2) { dismiss.tap() }
    if let directory = ProcessInfo.processInfo.environment["PR_DUTY_SWAP_SHOT_DIR"] {
      let device = ProcessInfo.processInfo.environment["PR_DUTY_SWAP_DEVICE"] ?? "device"
      let version = ProcessInfo.processInfo.environment["PR_DUTY_SWAP_SHOT_VERSION"] ?? "1"
      let url = URL(fileURLWithPath: directory).appendingPathComponent("pr-duty-swap-\(device)-Ver\(version).png")
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: url)
    }
  }

  func testRbotFollowsCrewAcrossScreens() throws {
    try signInAsPR("392923", usePrefilledPassword: true)
    wait("dock-rbot").tap()
    wait("rbot-panel")
    let homeInput = wait("rbot-input")
    homeInput.tap()
    homeInput.typeText("Which screen am I on?")
    wait("rbot-send").tap()
    XCTAssertTrue(text("You're on Home.").waitForExistence(timeout: 15))
    wait("rbot-close").tap()

    wait("tab-profile").tap()
    wait("row-preferences").tap()
    wait("page-preferences")
    wait("dock-rbot").tap()
    wait("rbot-panel")
    let prefInput = wait("rbot-input")
    prefInput.tap()
    prefInput.typeText("Which screen am I on?")
    wait("rbot-send").tap()
    XCTAssertTrue(text("You're on Preferences.").waitForExistence(timeout: 15))
    XCTAssertTrue(text("You're on Home.").exists, "the conversation should follow the crew")
    prefInput.tap()
    prefInput.typeText("What can I do here?")
    wait("rbot-send").tap()
    let controlsReply = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "On Preferences, you can")).firstMatch
    XCTAssertTrue(controlsReply.waitForExistence(timeout: 15), "R'Bot should know page controls")
    if let dir = ProcessInfo.processInfo.environment["RBOT_SHOT_DIR"] {
      let url = URL(fileURLWithPath: dir).appendingPathComponent("rbot-context-across-screens-Ver2.png")
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: url)
    }
  }

  /// Duty Swap on the inner screen: Search pairing with its live preview, the crew
  /// matrix, then R'Bot sharing the screen
  /// (side pane on `wide`, bottom half on `tall`). Step 1 is answered on the phone;
  /// step 2 is a free-form request only the ai-server's swap tools answer
  /// (cr.rois.one/ai/crew/chat, screen "duty_swap").
  func testMatrixPinchHeightPR473006() throws {
    try signInAsPR("473006", usePrefilledPassword: true)
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 5) { tapDialogConfirm("swap-disclaimer") }
    wait("search-submit", 60).tap()
    let matrix = wait("crew-matrix-zoom", 90)
    let duty = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'duty-473006-PR'")).firstMatch
    XCTAssertTrue(duty.waitForExistence(timeout: 30))
    let before = duty.frame.height
    matrix.pinch(withScale: 2.5, velocity: 1)
    XCTAssertGreaterThan(duty.frame.height, before + 10, "pinch must grow the duty with its date rows")
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["IPAD_SHOT_DIR"])
    let version = ProcessInfo.processInfo.environment["IPAD_SHOT_VERSION"] ?? "1"
    try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("matrix-pinch-expanded-Ver\(version).png"))
    let expanded = duty.frame.height
    matrix.pinch(withScale: 0.4, velocity: -1)
    XCTAssertLessThan(duty.frame.height, expanded - 10)
    for _ in 0..<3 { matrix.pinch(withScale: 0.3, velocity: -1) }
    XCTAssertLessThanOrEqual(duty.frame.height, before + 5)
  }

  /// Matrix uses a vertical time axis, so the selected Mine duty's start/end
  /// guides run horizontally through the candidate columns and follow pinch.
  func testMatrixSelectionGuidesAndAccountIsolation() throws {
    let device = ProcessInfo.processInfo.environment["MATRIX_GUIDE_DEVICE"] ?? "air"
    let version = ProcessInfo.processInfo.environment["MATRIX_GUIDE_VERSION"] ?? "1"
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["MATRIX_GUIDE_SHOT_DIR"])
    func capture(_ state: String) throws {
      let name = "matrix-selection-guides-\(device)-\(state)-Ver\(version).png"
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name))
    }
    func guides() -> XCUIElementQuery {
      app.descendants(matching: .any).matching(NSPredicate(format:
        "identifier == 'matrix-guide-start' OR identifier == 'matrix-guide-end'"))
    }

    if device == "ipad" {
      XCUIDevice.shared.orientation = .landscapeLeft
      let landscape = expectation(for: NSPredicate { _, _ in self.appFrame.width > self.appFrame.height }, evaluatedWith: app)
      wait(for: [landscape], timeout: 10)
    }
    try signInAsPR("473006", usePrefilledPassword: true)
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 5) { tapDialogConfirm("swap-disclaimer") }
    if el("app-dialog").exists && text("Before you swap").exists { tapDialogConfirm("app-dialog") }
    wait("approach-matrix").tap()
    if el("search-submit").waitForExistence(timeout: 8) { el("search-submit").tap() }
    let matrix = wait("crew-matrix-zoom", 90)
    XCTAssertEqual(guides().count, 0)
    let duty = app.descendants(matching: .any).matching(NSPredicate(format:
      "identifier BEGINSWITH 'duty-473006-' AND enabled == true")).allElementsBoundByIndex.first { $0.isHittable }
    let selected = try XCTUnwrap(duty, "No visible published Mine duty for PR473006")
    selected.tap()
    let appeared = expectation(for: NSPredicate { _, _ in guides().count == 2 }, evaluatedWith: app)
    wait(for: [appeared], timeout: 10)
    XCTAssertEqual(el("matrix-guide-start").frame.midY, selected.frame.minY, accuracy: 3)
    XCTAssertEqual(el("matrix-guide-end").frame.midY, selected.frame.maxY, accuracy: 3)
    XCTAssertGreaterThan(el("matrix-guide-start").frame.maxX, matrix.frame.midX,
      "Start/end guides must reach the candidate area")
    try capture("selected")

    matrix.pinch(withScale: 1.6, velocity: 1)
    let followed = expectation(for: NSPredicate { _, _ in
      abs(self.el("matrix-guide-start").frame.midY - selected.frame.minY) <= 3 &&
      abs(self.el("matrix-guide-end").frame.midY - selected.frame.maxY) <= 3
    }, evaluatedWith: app)
    wait(for: [followed], timeout: 10)
    try capture("pinch-expanded")
    wait("swap-clear").tap()
    let cleared = expectation(for: NSPredicate { _, _ in guides().count == 0 }, evaluatedWith: app)
    wait(for: [cleared], timeout: 10)
    try capture("cleared")

    wait("page-back").tap()
    wait("tab-profile").tap()
    let add = el("profile-add-airline")
    if add.exists { add.tap() } else { wait("profile-logout").tap() }
    tapDialogConfirm("profile-dialog")
    wait("login-screen", 60)
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    XCTAssertEqual(el("crew-id").value as? String, "35459")
    wait("login-btn").tap()
    wait("home-screen", 30)
    wait("qa-duty-swap").tap()
    wait("page-swap")
    XCTAssertEqual(guides().count, 0)
    XCTAssertFalse(text("473006").exists, "PR selection leaked into the TG account")
    try capture("tg-isolation")
  }

  func testDuoDutySwapPR392923() throws {
    try signInAsPR("392923")
    let frame = appFrame
    XCTAssertGreaterThanOrEqual(frame.width, 560, "not on the Duo inner screen: \(frame)")
    let tag = layoutClass == .wide ? "wide" : "tall"

    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 30) { tapDialogConfirm("swap-disclaimer") }

    // Design D0: Search pairing first, with a live preview of the matching crews —
    // right of the form on wide, below it on tall.
    let form = wait("search-form", 60)
    let preview = wait("search-preview", 30)
    // The preview draws a read-only matrix; the pick step's toolbar (crew count) is not there yet.
    XCTAssertFalse(el("swap-crew-count").exists, "the pick step must not show before searching")
    if layoutClass == .wide {
      XCTAssertGreaterThan(preview.frame.minX, form.frame.maxX - 1, "preview should sit right of the form")
    } else {
      XCTAssertGreaterThan(preview.frame.minY, form.frame.maxY - 1, "preview should sit below the form")
    }
    XCTAssertTrue(text("Preview ·").waitForExistence(timeout: 60), "preview header missing")
    sleep(3)
    shot("s00_search_\(tag)")
    wait("search-submit").tap()

    let matrix = wait("crew-matrix", 90)
    XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'matrix-crew-'")).firstMatch
      .waitForExistence(timeout: 60), "no other crew in the matrix")
    sleep(2)
    shot("s01_matrix_\(tag)")
    if layoutClass == .wide {
      // Landscape inner: the swap tray is a rail right of the matrix.
      let rail = wait("swap-tray")
      XCTAssertGreaterThan(rail.frame.minX, matrix.frame.maxX - 1, "swap rail should sit right of the matrix")
    }

    // R'Bot shares the screen.
    wait("swap-rbot-open").tap()
    let panel = wait("swap-rbot-panel", 10)
    if layoutClass == .wide {
      XCTAssertGreaterThan(panel.frame.minX, frame.midX - 40, "R'Bot should be the right-hand pane on wide")
    } else {
      XCTAssertGreaterThan(panel.frame.minY, frame.minY + frame.height / 3, "R'Bot should share the lower part on tall")
    }
    sleep(1)
    shot("s02_rbot_open_\(tag)")

    // 1. Local: the suggestion built from my own first trip.
    wait("swap-rbot-suggestion").tap()
    XCTAssertTrue(text("in the table now").waitForExistence(timeout: 60), "local search reply missing")
    XCTAssertTrue(text("on this phone").exists, "step 1 should be answered on the phone")
    let localTags = app.descendants(matching: .any).matching(NSPredicate(format: "label == 'on this phone'")).count
    sleep(1)
    shot("s03_rbot_local_\(tag)")

    // 2. Server: a request the local interpreter does not cover.
    let input = wait("swap-rbot-input")
    input.tap()
    input.typeText("who has a quiet week around the 20th?")
    wait("swap-rbot-send").tap()
    let reply = wait("swap-rbot-assistant-3", 120)
    let said = reply.label
    XCTAssertFalse(said.hasPrefix("R'Bot could not finish that"), "server reply failed: \(said)")
    XCTAssertEqual(app.descendants(matching: .any).matching(NSPredicate(format: "label == 'on this phone'")).count, localTags,
                   "step 2 must come from the server, not the phone")
    sleep(2)
    shot("s04_rbot_server_\(tag)")
    print("DUO_SWAP_SERVER_REPLY: \(said)")

    wait("swap-rbot-close").tap()
    XCTAssertTrue(wait("crew-matrix").exists)
  }

  /// Duty Swap · Match on the inner screen, all four steps. Every duty card has the
  /// same shape: the date block on the left, then the flight numbers and
  /// `<start> → [dd Mon] <end> · AIRPORTS` on the right — including Pick, where each
  /// candidate's detail must arrive without opening a card. Read-only (nothing sent).
  func testDuoMatchFlightRoutes() throws {
    let version = ProcessInfo.processInfo.environment["MATCH_ROUTES_VERSION"] ?? "1"
    try signInAsPR("473006", usePrefilledPassword: true)
    let frame = appFrame
    XCTAssertGreaterThanOrEqual(frame.width, 560, "not on the Duo inner screen: \(frame)")
    let tag = layoutClass == .wide ? "wide" : "tall"
    func capture(_ step: String) { shot("match-routes-inner-\(tag)-\(step)-Ver\(version)") }
    /// Flight numbers, then the timing line with its airport chain.
    let flightRow = NSPredicate(format: "label BEGINSWITH 'PR' OR label BEGINSWITH 'X' OR label BEGINSWITH 'NO_DUTY_DAY' OR label BEGINSWITH 'SBY'")
    let routeRow = NSPredicate(format: "label CONTAINS %@", " · ") // "08:30–16:45 · MNL–HKG–MNL"
    /// A `dd` + month block on the left of a card.
    func dateBlock(_ month: String) -> XCUIElement {
      app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", month)).firstMatch
    }

    // An ad / auth overlay can still be up after sign-in; clear it before tapping.
    if el("app-dialog").waitForExistence(timeout: 5) { tapDialogConfirm("app-dialog") }
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 5) { tapDialogConfirm("swap-disclaimer") }
    if el("app-dialog").exists { tapDialogConfirm("app-dialog") }
    // Wide: the switch is the right-hand rail; compact/tall: the header. Wait for either.
    let switchShown = expectation(for: NSPredicate { _, _ in
      self.el("swap-approach-header").exists || self.el("swap-approach-rail").exists
    }, evaluatedWith: app)
    wait(for: [switchShown], timeout: 30)
    wait("approach-ticket").tap()
    if el("app-dialog").waitForExistence(timeout: 5) { tapDialogConfirm("app-dialog") }

    // ── Step 1 · Give ────────────────────────────────────────────────────────────
    wait("ticket-give", 60)
    // Nothing is selected yet: every card must still name its airports (255).
    XCTAssertTrue(app.descendants(matching: .any).matching(routeRow).firstMatch.waitForExistence(timeout: 180),
                  "Give (nothing selected): duty cards do not show their timing · airports")
    XCTAssertTrue(dateBlock("Oct").exists || dateBlock("Nov").exists, "Give: no date block on the card")
    capture("s01_give_unselected")
    let duty = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'ticket-give-' AND enabled == true")).firstMatch
    XCTAssertTrue(duty.waitForExistence(timeout: 30), "no unlocked duty for PR")
    duty.tap()
    XCTAssertTrue(text("1 selected").waitForExistence(timeout: 5))
    capture("s01b_give_selected")
    XCTAssertTrue(app.descendants(matching: .any).matching(routeRow).firstMatch.exists,
                  "Give: the selected duty lost its timing · airports")
    wait("ticket-next").tap()

    // ── Step 2 · Want ────────────────────────────────────────────────────────────
    wait("search-form", 30)
    sleep(5)
    capture("s02_want")
    XCTAssertTrue(dateBlock("Oct").exists || dateBlock("Nov").exists, "Want: no date block on my duty")
    XCTAssertTrue(app.descendants(matching: .any).matching(routeRow).firstMatch.exists,
                  "Want: my duty lost its timing · airports")
    wait("ticket-next").tap()

    // ── Step 3 · Pick ────────────────────────────────────────────────────────────
    wait("ticket-take-title", 60)
    // Ryan's case (252): crew 541273's PR102/PR103 listed no airports on Pick.
    XCTAssertTrue(wait("ticket-match-541273", 60).exists, "candidate 541273 is missing from Pick")
    XCTAssertTrue(app.descendants(matching: .any).matching(routeRow).firstMatch.waitForExistence(timeout: 180),
                  "Pick: candidate duties do not show their airports")
    let target = wait("ticket-match-541273", 30)
    XCTAssertFalse(target.isSelected, "Pick should start without a selected crew")
    capture("s03_pick")
    let want = NSPredicate(format: "label CONTAINS %@", "MNL–LAX–MNL")
    let theirs = target.descendants(matching: .any).matching(want).firstMatch
    XCTAssertTrue(theirs.waitForExistence(timeout: 60), "541273's PR102/PR103 does not name MNL–LAX–MNL")
    target.tap()
    XCTAssertTrue(wait("ticket-match-541273").isSelected, "tapping 541273 should select the Pick card")
    capture("s03b_pick_selected")
    wait("ticket-next").tap()

    // ── Step 4 · Send ────────────────────────────────────────────────────────────
    wait("swap-ticket", 60)
    sleep(5)
    capture("s04_send")
    let giveSide = wait("ticket-selected-give", 30)
    XCTAssertTrue(giveSide.descendants(matching: .any).matching(routeRow).firstMatch.exists,
                  "Send: my give duty does not show its timing · airports")
    let takeSide = wait("ticket-selected-take", 30)
    XCTAssertTrue(takeSide.descendants(matching: .any).matching(want).firstMatch.waitForExistence(timeout: 60),
                  "Send: the duty I take does not name its airports")
  }

  /// Cabin crew PR 452320 (rank FS, several fleets): the search returns 123 candidates
  /// (the web pages them 11 × 12). The matrix shows "1–N of 123 crew" and scrolls to the
  /// far end; R'Bot finds the crew with US duties; then 452320's 13 Oct MNL–LAX trip
  /// (PR112/PR103) is offered to three of them, each through Compare & send.
  /// Sends real requests on the PR TEST tenant (crew asked for them; not withdrawn).
  func testDuoDutySwapCabinCrewPR452320() throws {
    try signInAsPR("452320")
    let tag = layoutClass == .wide ? "wide" : "tall"
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 30) { tapDialogConfirm("swap-disclaimer") }
    _ = wait("search-form", 60)
    let t0 = Date()
    wait("search-submit").tap()
    _ = wait("crew-matrix", 90)
    let anyCrew = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'matrix-crew-'")).firstMatch
    XCTAssertTrue(anyCrew.waitForExistence(timeout: 60), "no candidate crew")
    print("DUO_CABIN_MATRIX_SECONDS: \(String(format: "%.1f", Date().timeIntervalSince(t0)))")
    let count = wait("swap-crew-count")
    XCTAssertTrue(count.waitForLabel(matching: #"^1–\d+ of 12\d crew$"#, timeout: 30), "count: \(count.label)")
    sleep(2)
    shot("x01_cabin_123_\(tag)")

    // Far end of the list: the window keeps mounting the columns in view.
    let body = wait("crew-matrix-scroll")
    for _ in 0..<12 { body.swipeLeft(velocity: .fast) }
    XCTAssertFalse(count.label.hasPrefix("1–"), "matrix did not scroll: \(count.label)")
    XCTAssertTrue(anyCrew.exists, "no crew column mounted after scrolling")
    sleep(2)
    shot("x02_cabin_scrolled_\(tag)")

    // R'Bot: the crew with US duties.
    wait("swap-rbot-open").tap()
    let input = wait("swap-rbot-input", 10)
    input.tap()
    input.typeText("Find crew with US duties")
    wait("swap-rbot-send").tap()
    XCTAssertTrue(text("US duties").waitForExistence(timeout: 90), "R'Bot did not run the US search")
    XCTAssertTrue(count.waitForLabel(matching: #"^(1–\d+ of )?[1-9]\d? crew$"#, timeout: 60), "US crews: \(count.label)")
    sleep(2)
    shot("x03_rbot_us_duties_\(tag)")
    wait("swap-rbot-close").tap()

    // Offer the 13 Oct LAX trip to US-trip crews until three requests are sent
    // (DUO_CABIN_SENDS=0: layout-only run, nothing sent).
    let want = Int(ProcessInfo.processInfo.environment["DUO_CABIN_SENDS"] ?? "3") ?? 3
    // US trips of about the same length as PR112/PR103 (a longer one fails "Cumulative
    // Limits" for 452320), in crew-id order: the matrix only scrolls forward here.
    let candidates: [(String, String)] = [("420941", "PR102"), ("439733", "PR104"), ("472212", "PR122"), ("476403", "PR100"),
                                          ("532781", "PR124"), ("540962", "PR104"), ("544140", "PR112"), ("546564", "PR122"), ("549044", "PR102")]
    var sent: [String] = []
    for (crew, code) in candidates where sent.count < want {
      let mine = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'duty-452320-PR112'")).firstMatch
      XCTAssertTrue(mine.waitForExistence(timeout: 30), "my 13 Oct PR112 trip is not in the matrix")
      if !mine.label.contains("selected") { mine.tap() }
      guard scrollToCrew(crew, body) else { print("DUO_CABIN_SKIP \(crew): column not found"); continue }
      let theirs = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "duty-\(crew)-\(code)")).firstMatch
      guard theirs.waitForExistence(timeout: 10), theirs.isHittable else { print("DUO_CABIN_SKIP \(crew): \(code) not tappable"); continue }
      theirs.tap()
      _ = wait("tray-delta", 30)
      wait("swap-compare").tap()
      _ = wait("compare-sheet", 20)
      let note = wait("swap-comment", 30)
      note.tap()
      note.typeText("crew-app dev test: 13 Oct LAX trip for your US trip")
      wait("swap-submit").tap()
      // Legality runs on submit and the app allows it 120 s; give the dialog margin.
      let result = wait("swap-result", 200)
      let said = result.label
      print("DUO_CABIN_RESULT \(crew): \(said)")
      if said.contains("Request sent") {
        sent.append(crew)
        shot("x04_sent_\(crew)_\(tag)")
        // Done (left pill): back to the matrix, nothing picked.
        result.coordinate(withNormalizedOffset: CGVector(dx: 0.34, dy: 1)).withOffset(CGVector(dx: 0, dy: -42)).tap()
      } else {
        shot("x04_refused_\(crew)_\(tag)")
        tapDialogConfirm("swap-result", single: true) // Edit swap
        wait("compare-close").tap()
        if el("swap-clear").waitForExistence(timeout: 5) { el("swap-clear").tap() }
      }
      XCTAssertTrue(el("compare-sheet").waitForNonExistence(timeout: 20), "compare sheet did not close")
    }
    print("DUO_CABIN_SENT: \(sent)")
    XCTAssertGreaterThanOrEqual(sent.count, want, "only \(sent.count) request(s) sent: \(sent)")
  }

  /// Drags the crew columns until `crew`'s header is fully in view (the list is in
  /// crew-id order, so it only ever moves right).
  private func scrollToCrew(_ crew: String, _ body: XCUIElement) -> Bool {
    let head = el("matrix-crew-\(crew)")
    let view = body.frame
    for _ in 0..<60 {
      if head.exists && head.frame.minX >= view.minX - 1 && head.frame.maxX <= view.maxX + 1 { return true }
      if head.exists && head.frame.maxX > view.maxX {
        let from = body.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.15))
        from.press(forDuration: 0.05, thenDragTo: body.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: 0.15)))
      } else {
        body.swipeLeft()
      }
    }
    return false
  }

  /// Fresh PR imports on Air / unfolded Duo, followed by TG account isolation.
  /// ROUTE_DEVICE=air|duo; DUO_SHOT_DIR points at the versioned evidence directory.
  func testPRRouteMapArrivalAirports() throws {
    let device = ProcessInfo.processInfo.environment["ROUTE_DEVICE"] ?? "duo"
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["DUO_SHOT_DIR"])
    let version = ProcessInfo.processInfo.environment["ROUTE_SHOT_VERSION"] ?? "1"
    func capture(_ id: String) throws {
      let name = "route-map-\(device)-\(id)-Ver\(version)"
      if device == "duo" { shot(name) }
      else { try app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name + ".png")) }
    }
    func signOut() {
      wait("tab-profile").tap()
      let add = el("profile-add-airline")
      if add.exists { add.tap() } else { wait("profile-logout").tap() }
      tapDialogConfirm("profile-dialog")
      wait("login-screen", 60)
    }
    func checkMap(_ id: String, base: String) throws {
      wait("tab-profile").tap()
      XCTAssertTrue(text(id).waitForExistence(timeout: 10), "wrong crew after account switch")
      wait("tab-schedule").tap()
      // TG's test account publishes September, while these PR accounts publish
      // October. Exercise the actual month controls, not a fabricated roster.
      if base == "BKK" { wait("sched-prev-month").tap() }
      XCTAssertTrue(wait("sched-title").label.contains(base == "BKK" ? "Sep 2026" : "Oct 2026"))
      pickView("sched-view-route")
      wait("route-svg", 60)
      XCTAssertFalse(el("route-empty").exists)
      XCTAssertTrue(text("\(base) · BASE").exists)
      for metric in ["flights", "distance", "routes"] {
        let cell = wait("route-stat-\(metric)")
        let labels = ([cell.label] + cell.descendants(matching: .staticText).allElementsBoundByIndex.map { $0.label }).joined(separator: " ")
        XCTAssertNotNil(labels.range(of: "[1-9]", options: .regularExpression), "\(id): \(metric) is zero: \(labels)")
        print("ROUTE_MAP \(device) \(id) \(metric): \(labels)")
      }
      wait("route-zoom-in").tap()
      wait("route-zoom-out").tap()
      if id == "487424" { XCTAssertTrue(el("route-TPE").exists, "MNL–TPE route missing") }
      if id == "473006" {
        XCTAssertTrue(el("route-HND").exists, "MNL–Haneda route missing")
        XCTAssertTrue(wait("route-stat-routes").label.hasPrefix("7 "), "all seven October destinations must be mapped")
      }
      sleep(1)
      try capture(id)
    }
    // Never reuse a cached partial import, including the initially signed-in crew.
    if el("tab-profile").waitForExistence(timeout: 15) { signOut() }
    let crews = (ProcessInfo.processInfo.environment["ROUTE_CREWS"] ?? "487424,465800,473006").split(separator: ",").map(String.init)
    for id in crews {
      try signInAsPR(id, usePrefilledPassword: true)
      try checkMap(id, base: "MNL")
      signOut()
    }
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    wait("login-btn").tap()
    wait("home-screen", 200)
    let dismiss = app.buttons["Dismiss"]
    if dismiss.waitForExistence(timeout: 3) { dismiss.tap() }
    try checkMap("35459", base: "BKK")
    XCTAssertFalse(text("MNL · BASE").exists, "PR base leaked into TG")
  }

  /// Focused capture regression: complete login without pressing Use roster.
  func testPortalAutomaticImportPR452320() throws {
    XCTAssertEqual(ProcessInfo.processInfo.environment["CALENDAR_REQUIRE_AUTO_IMPORT"], "1")
    try signInAsPR("452320", usePrefilledPassword: true)
    wait("tab-profile").tap()
    XCTAssertTrue(text("452320").waitForExistence(timeout: 10))
    shot("portal-452320-auto-import-profile-Ver2")
    wait("tab-home").tap()
    wait("home-screen")
    XCTAssertFalse(el("portal-capture-web").exists)
    XCTAssertFalse(el("use-captured-roster").exists)
    shot("portal-452320-auto-import-home-Ver2")
  }

  /// One intentionally invalid fixture verifies rejection recovery; never retries a real crew.
  func testPortalLoginRejection() throws {
    if el("tab-profile").waitForExistence(timeout: 10) {
      wait("tab-profile").tap()
      let add = el("profile-add-airline")
      if add.exists { add.tap() } else { wait("profile-logout").tap() }
      tapDialogConfirm("profile-dialog")
    }
    wait("login-screen", 60)
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Philippine")
    wait("airline-PR").tap()
    let invalidCrew = "000000000000"
    replaceText(wait("crew-id"), with: invalidCrew)
    replaceText(wait("crew-pw"), with: "invalid-fixture-only")
    let hide = app.buttons["Hide keyboard"]
    if hide.exists && hide.isHittable { hide.tap() }
    if !el("login-btn").isHittable { app.staticTexts["ALWAYS A WAY FORWARD"].tap() }
    XCTAssertEqual(el("crew-id").value as? String, invalidCrew)
    wait("login-btn").tap()
    wait("portal-login-error", 60)
    XCTAssertEqual(wait("portal-login-identity").label, invalidCrew)
    XCTAssertFalse(el("portal-capture-web").exists, "rejected login must stop the portal WebView")
    Thread.sleep(forTimeInterval: 5)
    XCTAssertTrue(el("portal-login-error").exists, "rejection must remain stable until the user acts")
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["IPAD_SHOT_DIR"])
    try XCUIScreen.main.screenshot().pngRepresentation.write(to:
      URL(fileURLWithPath: directory).appendingPathComponent("portal-login-rejection-ipad-Ver1.png"))
    wait("portal-login-back").tap()
    wait("login-screen")
  }

  /// PR calendar month detail across Air, iPad, and Duo, followed by TG isolation.
  /// ROUTE_DEVICE selects the screenshot/layout target; ROUTE_CREWS accepts a
  /// comma-separated PR crew list, and CALENDAR_SHOT_VERSION keeps captures versioned.
  func testCalendarMonthDetailCrews() throws {
    let device = ProcessInfo.processInfo.environment["ROUTE_DEVICE"] ?? "air"
    let directory = try XCTUnwrap(
      ProcessInfo.processInfo.environment["DUO_SHOT_DIR"] ?? ProcessInfo.processInfo.environment["IPAD_SHOT_DIR"],
      "set TEST_RUNNER_DUO_SHOT_DIR or TEST_RUNNER_IPAD_SHOT_DIR",
    )
    let version = ProcessInfo.processInfo.environment["CALENDAR_SHOT_VERSION"] ?? "1"

    func signOut() {
      wait("tab-profile").tap()
      let add = el("profile-add-airline")
      if add.exists { add.tap() } else { wait("profile-logout").tap() }
      tapDialogConfirm("profile-dialog")
      wait("login-screen", 60)
    }

    func capture(_ crew: String, _ view: String) throws {
      // Debug builds can surface React Native's transient Metro connectivity
      // toast even after the embedded bundle has loaded. Keep visual receipts
      // focused on product UI.
      let dismiss = app.buttons["Dismiss"]
      if dismiss.exists && dismiss.isHittable { dismiss.tap() }
      let name = "calendar-month-detail-\(device)-\(crew)-\(view)-Ver\(version)"
      if device == "duo" {
        shot(name)
      } else {
        try XCUIScreen.main.screenshot().pngRepresentation.write(
          to: URL(fileURLWithPath: directory).appendingPathComponent(name + ".png"),
        )
      }
    }

    func openCalendar() {
      wait("tab-schedule").tap()
      wait("sched-title")
      pickView("sched-view-calendar")
      wait("cal-mode-toggle")
      wait("cal-month-detail")
    }

    func assertWeekdayGeometry() {
      let weekdays = (0..<7).map { wait("cal-weekday-\($0)") }
      // Read a settled set of frames: RN can finish a scroll/layout update
      // between XCUITest's separate accessibility queries.
      var frames = weekdays.map { $0.frame }
      for _ in 0..<4 {
        if frames.allSatisfy({ abs($0.midY - frames[0].midY) <= 1.5 }) { break }
        Thread.sleep(forTimeInterval: 0.5)
        frames = weekdays.map { $0.frame }
      }
      if !frames.allSatisfy({ abs($0.midY - frames[0].midY) <= 1.5 }) {
        try? capture("geometry", "failure")
      }
      for index in 1..<frames.count {
        XCTAssertEqual(frames[index].midY, frames[0].midY, accuracy: 1.5, "weekday \(index) wrapped to another row")
        XCTAssertLessThan(frames[index - 1].midX, frames[index].midX, "weekday order is not left to right")
      }
    }

    func checkCalendar(_ crew: String) throws {
      wait("tab-profile").tap()
      XCTAssertTrue(text(crew).waitForExistence(timeout: 10), "wrong PR crew after sign-in")
      openCalendar()
      // The real TG control roster is published in September; PR is October.
      // Use the same month selection as testPRRouteMapArrivalAirports.
      if crew == "35459" {
        wait("sched-prev-month").tap()
        XCTAssertTrue(wait("sched-title").label.contains("Sep 2026"))
      }

      // Full month detail is the default, including dim adjacent-month dates.
      assertWeekdayGeometry()
      try capture(crew, "month-detail-default")
      if ProcessInfo.processInfo.environment["CALENDAR_VALIDATE_ROTATIONS"] == "1" {
        XCUIDevice.shared.orientation = .landscapeLeft
        _ = wait("cal-month-detail")
        assertWeekdayGeometry()
        try capture(crew, "month-detail-landscape")
        XCUIDevice.shared.orientation = .portrait
        _ = wait("cal-month-detail")
        assertWeekdayGeometry()
      }
      XCTAssertFalse(el("cal-day-pane").exists, "month detail must not have a right-side day pane")
      XCTAssertFalse(el("cal-agenda-head").exists, "month-detail mode should not show the agenda")
      XCTAssertGreaterThan(wait("cal-month-detail").frame.width, appFrame.width * 0.70,
        "month detail should use the screen width")
      try capture(crew, "month-detail-grid")

      // Finalist comparison fixture: Wed 14 Oct contains the same shared
      // Calendar meeting plus PR740 and PR741 in both apps.
      let flightDay = wait("cal-day-14")
      XCTAssertTrue(flightDay.label.contains("PR740"), "14 Oct is missing PR740")
      XCTAssertTrue(flightDay.label.contains("PR741"), "14 Oct is missing PR741")
      let dayID = flightDay.identifier
      let day = String(dayID.dropFirst("cal-day-".count))
      if !flightDay.isHittable {
        wait("cal-compact")
        // The accessibility container can include the entire month content.
        // Drag inside the visible viewport, above the floating navigation dock.
        for _ in 0..<12 where !flightDay.isHittable {
          app.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.65))
            .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.28)))
        }
      }
      XCTAssertTrue(flightDay.isHittable, "\(crew) flight date \(day) is offscreen in month detail")
      let dateLabel = flightDay.label
      guard let flightRange = dateLabel.range(of: "[A-Z]{2,3}[0-9]{2,4}", options: .regularExpression) else {
        XCTFail("\(crew) flight date label has no flight number: \(dateLabel)")
        return
      }
      let flightCode = String(dateLabel[flightRange])

      flightDay.tap()
      XCTAssertTrue(wait(dayID).isSelected, "tapping a date should select it in the month")
      XCTAssertFalse(el("cal-agenda-head").exists, "rich month should keep all space for the calendar")

      // First upward swipe compresses event cards to lines and reveals day details.
      wait("cal-month-detail").swipeUp()
      wait("cal-grid")
      let agendaHead = wait("cal-agenda-head")
      XCTAssertTrue(agendaHead.label.contains("\(day) "), "selected agenda date mismatch: \(agendaHead.label)")
      let agendaFlight = app.descendants(matching: .any)
        .matching(NSPredicate(format: "label CONTAINS %@", flightCode))
        .firstMatch
      XCTAssertTrue(agendaFlight.waitForExistence(timeout: 10), "\(crew) selected day details are missing \(flightCode)")
      for value in ["RBC Credit Due", "EK371", "Get Ready · PR740", "Leave Home · PR740",
                    "Check-in PR740", "PR740 · MNL → BKK", "Get Ready · PR585",
                    "Flair Weekly Meeting", "Leave Home · PR585", "PR741 · BKK → MNL",
                    "Check-in PR585", "PR585 · MNL → DAD", "PR586 · DAD → MNL",
                    "05:35", "08:55", "10:20", "14:00", "12:50", "15:20", "16:30", "19:20"] {
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", value)).firstMatch.exists,
          "14 Oct is missing Finalist value \(value)")
      }
      let agendaFlights = app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'cal-row-flight-'"))
      let calendarRows = app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'cal-meeting-' AND identifier != 'cal-meeting-join' AND identifier != 'cal-meeting-alarm'"))
      XCTAssertEqual(agendaFlights.count + calendarRows.count, 13,
        "14 Oct must match Finalist's 13 visible events without duplicate roster legs")
      let pr740Title = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'PR740' AND label CONTAINS 'MNL' AND label CONTAINS 'BKK'")).firstMatch
      let pr741Title = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'PR741' AND label CONTAINS 'BKK' AND label CONTAINS 'MNL'")).firstMatch
      XCTAssertLessThan(pr740Title.frame.minY, pr741Title.frame.minY,
        "PR740/PR741 chronological order differs from Finalist")
      XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS '經過和團隊成員溝通'")).firstMatch.exists,
        "Finalist meeting note is missing")
      XCTAssertTrue(el("cal-meeting-join").exists, "Teams meeting needs a visible Join action")
      let dailyPlanner = wait("cal-daily-planner")
      let dayRail = wait("cal-day-rail")
      let railSpans = app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'cal-rail-flight-'"))
      XCTAssertLessThanOrEqual(railSpans.count, 2, "dedup must not leave duplicate roster flight spans")
      let meetingSpans = app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'cal-rail-meet-'"))
      XCTAssertEqual(railSpans.count + meetingSpans.count, 12,
        "14 Oct must have one rail span per timed event; all-day RBC has no span")
      let allRailSpans = (0..<railSpans.count).map { railSpans.element(boundBy: $0) }
        + (0..<meetingSpans.count).map { meetingSpans.element(boundBy: $0) }
      let allFrames = allRailSpans.map(\.frame)
      XCTAssertTrue(allFrames.allSatisfy { $0.width >= 4 && $0.height >= 3 },
        "every rail span must have visible geometry")
      let baselineX = dayRail.frame.minX + 7.5
      for frame in allFrames {
        XCTAssertEqual(frame.midX, baselineX, accuracy: 1, "all event spans share the rail center")
      }
      XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'cal-rail-overlap-'")).firstMatch.exists,
        "overlapping portions must be visibly shaded")
      let continuations = app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier BEGINSWITH 'cal-rail-continuation-'"))
      XCTAssertGreaterThanOrEqual(continuations.count, 1, "overnight EK371 needs a rail continuation marker")
      XCTAssertGreaterThan(dayRail.frame.height, 80,
        "fixed rail should fit the remaining daily viewport")
      XCTAssertLessThan(dayRail.frame.width, dailyPlanner.frame.width * 0.2,
        "24-hour rail should remain a narrow scale beside daily activity")
      XCTAssertGreaterThan(dayRail.frame.minX, dailyPlanner.frame.midX,
        "24-hour rail must stay on the right of the selected-day activity list")
      try capture(crew, "selected-day")

      // Events and rail now scroll together; the rail retains its height.
      let railHeight = dayRail.frame.height
      wait("cal-daily-scroll").swipeUp()
      XCTAssertEqual(wait("cal-day-rail").frame.height, railHeight, accuracy: 1)
      try capture(crew, "selected-day-scrolled")
      wait("cal-daily-scroll").swipeDown()

      // Second upward swipe selects one week and gives the agenda more room.
      wait("cal-grid").swipeUp()
      wait("cal-week-grid")
      XCTAssertTrue(wait(dayID).exists, "selected date must remain in week mode")
      try capture(crew, "selected-week")

      // Downward gestures reverse the exact same ladder.
      wait("cal-week-grid").swipeDown()
      wait("cal-grid")
      wait("cal-grid").swipeDown()
      wait("cal-month-detail")
      XCTAssertTrue(wait(dayID).isSelected, "expanding the month lost the selected day")
      XCTAssertFalse(el("cal-agenda-head").exists, "expanded month should hide the agenda")
      try capture(crew, "returned-month-detail")

      // Hourly details remain an explicit action after selecting a date.
      wait("cal-mode-toggle").tap()
      wait("cal-to-detail").tap()
      let detail = wait("cal-detail")
      let restoredFlight = detail.descendants(matching: .any)
        .matching(NSPredicate(format: "label CONTAINS %@", flightCode))
        .firstMatch
      XCTAssertTrue(restoredFlight.waitForExistence(timeout: 10), "day details did not contain \(flightCode)")
      try capture(crew, "selected-day-hours")
      wait("cal-to-compact").tap()
      wait("cal-grid")

      // The month stepper must move forward and back.
      let originalMonth = wait("sched-title").label
      wait("sched-next-month").tap()
      XCTAssertNotEqual(wait("sched-title").label, originalMonth, "next month did not advance")
      wait("sched-prev-month").tap()
      XCTAssertEqual(wait("sched-title").label, originalMonth, "previous month did not restore the roster month")
    }

    if el("tab-profile").waitForExistence(timeout: 15) { signOut() }
    let crews = (ProcessInfo.processInfo.environment["ROUTE_CREWS"] ??
      "452320,487424,540753,473006,486541,563044,465800,479274,532510,493065")
      .split(separator: ",").map(String.init)
    for id in crews {
      try signInAsPR(id, usePrefilledPassword: true)
      try checkCalendar(id)
      signOut()
    }

    if ProcessInfo.processInfo.environment["CALENDAR_SKIP_TG"] == "1" { return }

    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    wait("login-btn").tap()
    wait("home-screen", 200)
    let dismiss = app.buttons["Dismiss"]
    if dismiss.waitForExistence(timeout: 3) { dismiss.tap() }
    try checkCalendar("35459")
    wait("tab-profile").tap()
    XCTAssertTrue(text("35459").waitForExistence(timeout: 10), "TG identity missing after account switch")
    XCTAssertTrue(wait("profile-provider-chip").label.lowercased().contains("thai"))
    for id in crews { XCTAssertFalse(text(id).exists, "PR identity \(id) leaked into TG") }
  }

  /// Visual-contract capture for the real Finalist comparison week. The host
  /// comparator checks these seven date-matched images against iphone-use
  /// receipts; element-presence assertions alone are not pixel-parity proof.
  func testFinalistOct17To23PixelParity() throws {
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["FINALIST_COMPARE_SHOT_DIR"])
    let version = ProcessInfo.processInfo.environment["FINALIST_COMPARE_VERSION"] ?? "1"

    XCUIDevice.shared.orientation = .portrait
    try signInAsPR("473006", usePrefilledPassword: true)
    wait("tab-schedule").tap()
    wait("sched-title")
    pickView("sched-view-calendar")
    wait("cal-month-detail")

    var missingPlannerDays: [Int] = []
    for day in 17...23 {
      let cell = wait("cal-day-\(day)")
      if !cell.isHittable {
        wait("cal-compact").swipeUp()
      }
      wait("cal-day-\(day)").tap()
      XCTAssertTrue(wait("cal-day-\(day)").isSelected)
      wait("cal-to-detail").tap()
      wait("cal-detail")
      XCTAssertTrue(wait("cal-agenda-head").label.contains(" \(day) OCT"))
      let file = URL(fileURLWithPath: directory)
        .appendingPathComponent("crew-finalist-oct\(day)-air-Ver\(version).png")
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
      if !el("cal-daily-planner").exists || !el("cal-day-rail").exists {
        missingPlannerDays.append(day)
      }
      wait("cal-to-compact").tap()
      wait("cal-month-detail")
    }
    XCTAssertTrue(missingPlannerDays.isEmpty,
      "Finalist comparison dates without a daily planner/rail: \(missingPlannerDays)")
  }

  /// Credential-free smoke test for the three calendar gesture levels.
  func testCalendarGestureGuest() throws {
    if el("login-screen").waitForExistence(timeout: 20) {
      let guest = el("guest-login")
      XCTAssertTrue(guest.waitForExistence(timeout: 10))
      guest.tap()
    }
    wait("home-screen", 60)
    wait("tab-schedule").tap()
    wait("sched-title", 30)
    pickView("sched-view-calendar")
    shot("duo-schedule-header-v223")

    let full = wait("cal-month-detail")
    XCTAssertFalse(el("cal-agenda-head").exists)
    XCTAssertTrue(app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'cal-adjacent-'")).firstMatch.exists,
      "full month must include adjacent-month dates")

    let publishedPreviewCount = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'cal-preview-'" )).count
    let populatedDay = wait("cal-day-18")
    let normalPreviewCount = populatedDay.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'cal-preview-'" )).count
    let day = wait("cal-day-17")
    let normalHeight = day.frame.height
    full.pinch(withScale: 0.75, velocity: -1)
    XCTAssertLessThan(day.frame.height, normalHeight - 4,
      "pinch in must reduce date-cell height")
    let collapsedHeight = day.frame.height
    shot("duo-calendar-density-collapsed-v223")
    wait("cal-month-detail").pinch(withScale: 1.5, velocity: 1)
    XCTAssertGreaterThan(day.frame.height, collapsedHeight + 4,
      "pinch out must increase date-cell height to reveal more duty information")
    XCTAssertGreaterThanOrEqual(populatedDay.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'cal-preview-'" )).count, normalPreviewCount,
      "expanded density must reveal at least the normal number of duty previews")
    XCTAssertTrue(el("cal-month-detail").exists, "pinch must preserve the calendar layout level")
    shot("duo-calendar-density-expanded-v223")

    wait("cal-month-detail").swipeUp()
    wait("cal-grid")
    let selected = (1...31)
      .map { el("cal-day-\($0)") }
      .first { $0.exists && $0.isSelected }
    XCTAssertNotNil(selected, "Month + day must expose its selected date")
    selected?.tap()
    let monthAgenda = wait("cal-agenda-head")
    XCTAssertTrue(monthAgenda.label.hasPrefix("MONTH · "))
    let publishedCount = Int(monthAgenda.label
      .components(separatedBy: "·").last?
      .trimmingCharacters(in: .whitespaces)
      .components(separatedBy: " ").first ?? "0") ?? 0
    XCTAssertGreaterThanOrEqual(publishedCount, publishedPreviewCount,
      "deselected Month + day must include every duty preview shown in the month")
    shot("duo-calendar-month-day-all-duties-v223")
    wait("cal-grid").swipeUp()
    wait("cal-week-grid")
    XCTAssertEqual(app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'cal-grid-week-'")).count, 1)

    wait("cal-week-grid").swipeDown()
    wait("cal-grid")
    wait("cal-grid").swipeDown()
    wait("cal-month-detail")
    XCTAssertFalse(el("cal-agenda-head").exists)

    wait("tab-home").tap()
    wait("home-screen")
    wait("qa-duty-swap", 10).tap()
    XCTAssertTrue(el("page-swap").waitForExistence(timeout: 20) || el("duty-swap-host").exists)
    shot("duo-duty-swap-pageshell-v223")

    if let directory = ProcessInfo.processInfo.environment["IPAD_SHOT_DIR"] {
      try XCUIScreen.main.screenshot().pngRepresentation.write(to:
        URL(fileURLWithPath: directory).appendingPathComponent("calendar-gesture-guest-returned-Ver1.png"))
    }
  }

  // MARK: full tour — every screen on the inner display, for layout review

  /// Opens `id` (if present), waits for `ready`, captures `name`, then goes back via `back`.
  private func visit(_ name: String, open id: String, ready: String, back: String = "page-back", check: (() -> Void)? = nil) {
    let opener = el(id)
    guard opener.waitForExistence(timeout: 10) else { XCTFail("\(id) missing — skipped \(name)"); return }
    opener.tap()
    guard el(ready).waitForExistence(timeout: 20) else { XCTFail("\(ready) did not appear for \(name)"); return }
    sleep(1)
    shot(name)
    check?()
    if el(back).waitForExistence(timeout: 5) { el(back).tap() }
  }

  func testDuoTourAllScreens() throws {
    continueAfterFailure = true
    signInAsK1001()
    _ = wait("home-next-trip", 60)
    sleep(1)
    shot("t01_home")
    // The rotation legs render on both Duo classes (a card on wide, inside the
    // ticket on tall) and never on the phone.
    XCTAssertEqual(el("home-rotation").waitForExistence(timeout: 5), layoutClass != .compact, "home-rotation vs \(layoutClass) (\(appFrame.size))")
    expectLayout("home-dest-grid", on: .tall)
    visit("t02_alerts", open: "home-alerts", ready: "notifications-screen", back: "alerts-back", check: { self.expectLayout("alerts-wide", on: .wide) })
    visit("t03_upcoming_alarms", open: "home-alarms", ready: "page-upcoming-alarms")
    let dest = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier MATCHES 'dest-[A-Z]{3}'")).firstMatch
    if dest.waitForExistence(timeout: 10) {
      dest.tap()
      if el("page-destination").waitForExistence(timeout: 20) {
        sleep(1); shot("t04_destination")
        expectLayout("dest-photo-pane-wide", on: .wide)
        expectLayout("dest-photo-pane-tall", on: .tall)
      }
      if el("dest-back").waitForExistence(timeout: 5) { el("dest-back").tap() }
    } else { XCTFail("no destination tile") }
    visit("t05_trip_details", open: "home-next-trip", ready: "page-trip-details", check: { self.expectLayout("trip-tall-cards", on: .tall) })
    visit("t06_checkin", open: "qa-check-in", ready: "page-back")
    visit("t07_absence", open: "qa-absence", ready: "page-absence", check: { self.expectLayout("absence-summary", on: .wide) })
    visit("t08_discretion", open: "qa-discretion", ready: "page-discretion")
    visit("t09_duty_swap", open: "qa-duty-swap", ready: "page-back")
    visit("t10_more", open: "qa-more", ready: "page-back")

    wait("tab-schedule").tap()
    _ = wait("sched-title")
    sleep(2)
    shot("t11_schedule_timeline")
    expectLayout("sched-view-rail", on: .wide)
    pickView("sched-view-calendar"); _ = wait("cal-month-detail"); sleep(1)
    shot("t12_schedule_calendar")
    XCTAssertTrue(el("cal-month-detail").exists, "month detail should use the full calendar width")
    pickView("sched-view-route"); _ = wait("route-map"); sleep(1)
    shot("t13_schedule_route")
    expectLayout("route-grid", on: .tall)
    pickView("sched-view-timeline")

    XCTAssertFalse(el("tab-global").exists, "Global tab must stay hidden")

    wait("tab-profile").tap()
    _ = wait("profile-logout")
    shot("t15_profile")
    expectLayout("profile-tall", on: .tall)
    visit("t16_personal", open: "row-personal", ready: "page-personal")
    visit("t17_alarms_settings", open: "row-alarms", ready: "page-alarms")
    visit("t18_timezone", open: "row-timezone", ready: "page-timezone", check: {
      self.expectLayout("page-columns", on: .wide)
      self.expectLayout("page-centred", on: .tall)
    })
    visit("t19_preferences", open: "row-preferences", ready: "page-preferences")
    visit("t20_privacy", open: "row-privacy", ready: "page-back")
    visit("t21_help", open: "row-help", ready: "page-back")

    wait("dock-rbot").tap()
    if el("rbot-close").waitForExistence(timeout: 10) {
      sleep(1); shot("t22_rbot")
      expectLayout("rbot-context", on: .wide)
      el("rbot-close").tap()
    }
  }
  // MARK: Market — Duty Swap design Concept A "Swap Board" (PR cabin crew 487424)

  /// Concept B: real portal reads only. Run Air, then Duo, with just one sim booted.
  func testTwinRailHorizontalZoomAndAccountIsolation() throws {
    let device = ProcessInfo.processInfo.environment["TWIN_DEVICE"] ?? "air"
    let version = ProcessInfo.processInfo.environment["TWIN_VERSION"] ?? "1"
    let prCrew = ProcessInfo.processInfo.environment["TWIN_PR_CREW"] ?? "433535"
    func capture(_ state: String) throws {
      let name = "duty-swap-twin-\(device)-\(state)-Ver\(version)"
      if device == "duo" { shot(name) }
      else {
        let dir = try XCTUnwrap(ProcessInfo.processInfo.environment["TWIN_SHOT_DIR"])
        try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent(name + ".png"))
      }
    }
    try signInAsPR(prCrew, usePrefilledPassword: true)
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 8) { tapDialogConfirm("swap-disclaimer") }
    // The remembered concept may be Ticket or Twin Rail, each with its own dialog.
    if el("app-dialog").exists && text("Before you swap").exists { tapDialogConfirm("app-dialog") }
    if el("twin-disclaimer").exists { tapDialogConfirm("twin-disclaimer") }
    if !el("approach-twin").isHittable { el("swap-approach-header").swipeLeft() }
    wait("approach-twin").tap()
    if el("twin-disclaimer").waitForExistence(timeout: 8) { tapDialogConfirm("twin-disclaimer") }
    let loaded = app.descendants(matching: .any).matching(NSPredicate(format: "identifier == 'search-form' OR identifier == 'twin-error'")).firstMatch
    XCTAssertTrue(loaded.waitForExistence(timeout: 100))
    try capture("initial-search")
    XCTAssertFalse(el("twin-error").exists, "Portal could not supply duties; inspect screenshot before retrying")
    XCTAssertTrue(text("Target · all crew").exists, "shared search must start without a crew filter")
    // Start with a real crew filter, not the unfiltered first candidate.
    let targetCrew = ProcessInfo.processInfo.environment["TWIN_TARGET_CREW"] ?? "345945"
    wait("search-form")
    let searchScroll = el("search-form").descendants(matching: .scrollView).firstMatch
    let crewFilter = wait("search-crew-query")
    for _ in 0..<8 where !crewFilter.isHittable { searchScroll.swipeUp() }
    replaceText(crewFilter, with: targetCrew)
    wait("search-crew-\(targetCrew)", 30).tap()
    try capture("crew-filter")
    let hideKeyboard = app.buttons["Hide keyboard"]
    if hideKeyboard.exists && hideKeyboard.isHittable {
      hideKeyboard.tap()
    } else if app.keyboards.firstMatch.exists {
      crewFilter.typeText("\n")
    }
    let keyboardDismissed = expectation(
      for: NSPredicate(format: "exists == false"),
      evaluatedWith: app.keyboards.firstMatch
    )
    wait(for: [keyboardDismissed], timeout: 5)
    let submit = wait("search-submit")
    XCTAssertTrue(submit.isHittable, "Search must remain reachable after choosing a crew")
    submit.tap()
    wait("twin-me-rail")
    wait("twin-crew-\(targetCrew)")
    XCTAssertTrue(text("1 crew ·").exists, "the chosen crew filter must narrow candidates")
    XCTAssertTrue(text(prCrew).exists)
    let rail = wait("twin-rails")
    let rangeFormatter = DateFormatter()
    rangeFormatter.locale = Locale(identifier: "en_US_POSIX")
    rangeFormatter.calendar = Calendar(identifier: .gregorian)
    rangeFormatter.dateFormat = "dd MMM"
    func rangeStart(_ label: String) throws -> Date {
      let first = try XCTUnwrap(label.components(separatedBy: " – ").first)
      return try XCTUnwrap(rangeFormatter.date(from: first), "Could not parse Twin Rail range: \(label)")
    }
    for zoom in [3, 7, 14] {
      wait("twin-zoom-\(zoom)").tap()
      XCTAssertTrue(el("twin-zoom-\(zoom)").isSelected)
      let before = try rangeStart(wait("twin-window").label)
      rail.swipeLeft()
      let afterLeft = try rangeStart(wait("twin-window").label)
      XCTAssertEqual(
        afterLeft,
        Calendar(identifier: .gregorian).date(byAdding: .day, value: 1, to: before),
        "A left swipe in the \(zoom)d range must move exactly one day later"
      )
      if zoom == 14 { try capture("swipe-one-day") }
      rail.swipeRight()
      XCTAssertEqual(
        try rangeStart(wait("twin-window").label),
        before,
        "A right swipe in the \(zoom)d range must move exactly one day earlier"
      )
    }
    wait("twin-zoom-7").tap()
    let puck = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "twin-duty-\(prCrew):")).firstMatch
    let puckHeight = puck.frame.height
    rail.pinch(withScale: 2.5, velocity: 1)
    XCTAssertTrue(el("twin-zoom-3").isSelected, "pinch apart must zoom the horizontal time scale in")
    XCTAssertEqual(puck.frame.height, puckHeight, accuracy: 1, "horizontal zoom must preserve puck height")
    try capture("pinch-in")
    rail.pinch(withScale: 0.25, velocity: -1)
    try capture("pinch-out-first")
    // UIKit may clamp a large pinch to the touchable viewport. A second gesture
    // must still reach the widest supported window without changing height.
    XCTAssertFalse(el("twin-zoom-3").isSelected, "pinch together must widen the time window")
    if !el("twin-zoom-14").isSelected { rail.pinch(withScale: 0.25, velocity: -1) }
    XCTAssertTrue(el("twin-zoom-14").isSelected, "pinch together must zoom the horizontal time scale out")
    XCTAssertEqual(puck.frame.height, puckHeight, accuracy: 1, "zoom out must preserve puck height")
    try capture("pinch-out")
    wait("twin-zoom-7").tap()
    try capture("rails")
    let ownPrefix = "twin-duty-\(prCrew):"
    let giveBlock = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND enabled == true", ownPrefix)).allElementsBoundByIndex.first { $0.isHittable }
    XCTAssertNotNil(giveBlock, "No published own duty in this window")
    giveBlock?.tap()
    let takeBlock = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'twin-duty-' AND NOT identifier BEGINSWITH %@ AND enabled == true", ownPrefix)).allElementsBoundByIndex.first { $0.isHittable }
    XCTAssertNotNil(takeBlock, "No published candidate duty in this window")
    takeBlock?.tap()
    if el("twin-review-open").exists {
      let review = wait("twin-review-open")
      XCTAssertTrue(review.isEnabled, "Review must be enabled after both duties are selected")
      XCTAssertTrue(review.isHittable, "Review must remain on-screen and hittable: \(review.frame)")
      review.tap()
    }
    wait("twin-review", 15)
    wait("twin-delta", 45)
    wait("twin-review-details").tap()
    XCTAssertTrue(text("ME · GIVE").exists)
    XCTAssertTrue(el("twin-note").exists)
    try capture("review")
    if el("twin-review-back").exists { el("twin-review-back").tap() }
    wait("twin-search-open").tap()
    wait("search-start")
    XCTAssertTrue(el("search-crew").exists)
    XCTAssertTrue(el("search-briefStart").exists)
    try capture("search")
    wait("search-close").tap()
    wait("twin-rails")
    // The three original approaches still render via the same host.
    for pair in [("matrix", "duty-swap-screen"), ("market", "market-screen"), ("ticket", "ticket-screen")] {
      let approach = el("approach-\(pair.0)")
      if !approach.isHittable { el("swap-approach-header").swipeRight() }
      wait("approach-\(pair.0)").tap()
      wait(pair.1)
      if pair.0 == "ticket", el("app-dialog").waitForExistence(timeout: 8) { tapDialogConfirm("app-dialog") }
    }
    wait("page-back").tap()
    wait("tab-profile").tap()
    let add = el("profile-add-airline")
    if add.exists { add.tap() } else { wait("profile-logout").tap() }
    tapDialogConfirm("profile-dialog")
    wait("login-screen", 60)
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    XCTAssertEqual(el("crew-id").value as? String, "35459")
    let tgPassword = try XCTUnwrap(
      ProcessInfo.processInfo.environment["DUO_TG_PASSWORD"],
      "set DUO_TG_PASSWORD from local secure storage"
    )
    replaceText(wait("crew-pw"), with: tgPassword)
    XCTAssertFalse((el("crew-pw").value as? String ?? "").isEmpty, "TG password is empty")
    wait("login-btn").tap()
    wait("home-screen", 200)
    wait("qa-duty-swap").tap()
    wait("page-swap")
    XCTAssertFalse(el("twin-screen").exists)
    XCTAssertFalse(text(prCrew).exists)
    try capture("tg-isolation")
  }

  /// Search-first Twin Rail: own roster remains pinned while candidates scroll;
  /// selection guides follow the outer selected edges without changing row height.
  func testTwinRailSearchFirstGuidesAndAccountIsolation() throws {
    let device = ProcessInfo.processInfo.environment["TWIN_DEVICE"] ?? "air"
    let version = ProcessInfo.processInfo.environment["TWIN_VERSION"] ?? "1"
    func capture(_ state: String) throws {
      let name = "twin-search-guides-\(device)-\(state)-Ver\(version)"
      if device == "duo" { shot(name) }
      else {
        let dir = try XCTUnwrap(ProcessInfo.processInfo.environment["TWIN_SHOT_DIR"])
        try XCUIScreen.main.screenshot().pngRepresentation.write(to:
          URL(fileURLWithPath: dir).appendingPathComponent(name + ".png"))
      }
    }
    func guides() -> XCUIElementQuery {
      app.descendants(matching: .any).matching(NSPredicate(format:
        "identifier == 'twin-guide-start' OR identifier == 'twin-guide-end'"))
    }
    XCUIDevice.shared.orientation = .portrait
    try signInAsPR("473006", usePrefilledPassword: true)
    wait("qa-duty-swap", 30).tap()
    for id in ["swap-disclaimer", "twin-disclaimer"] {
      if el(id).waitForExistence(timeout: 5) { tapDialogConfirm(id) }
    }
    if el("app-dialog").exists && text("Before you swap").exists { tapDialogConfirm("app-dialog") }
    if !el("approach-twin").isHittable { el("swap-approach-header").swipeLeft() }
    wait("approach-twin").tap()
    if el("twin-disclaimer").waitForExistence(timeout: 8) { tapDialogConfirm("twin-disclaimer") }
    wait("search-form", 100)
    XCTAssertFalse(el("twin-calendar").exists)
    XCTAssertFalse(el("twin-new").exists)
    XCTAssertTrue(wait("twin-search-open").isHittable)
    try capture("initial-search")
    wait("search-submit").tap()
    wait("twin-me-rail")
    wait("twin-candidates", 60)
    XCUIDevice.shared.orientation = .landscapeLeft
    let landscape = expectation(for: NSPredicate { _, _ in self.appFrame.width > self.appFrame.height }, evaluatedWith: app)
    wait(for: [landscape], timeout: 10)
    wait("twin-zoom-14").tap()
    let fortnightSelected = expectation(for: NSPredicate(format: "selected == true"), evaluatedWith: el("twin-zoom-14"))
    wait(for: [fortnightSelected], timeout: 10)
    let ownRail = wait("twin-me-rail")
    let ownFrame = ownRail.frame
    let candidates = wait("twin-candidates")
    XCTAssertGreaterThan(candidates.frame.intersection(appFrame).height, 40)
    XCTAssertEqual(guides().count, 0)
    let ownDuties = app.descendants(matching: .any).matching(NSPredicate(format:
      "identifier BEGINSWITH 'twin-duty-473006:' AND enabled == true")).allElementsBoundByIndex.filter { $0.isHittable }
    XCTAssertGreaterThanOrEqual(ownDuties.count, 2, "Real published roster must expose two selectable duties in the fortnight")
    let first = try XCTUnwrap(ownDuties.first)
    let second = ownDuties[1]
    let puckHeight = first.frame.height
    first.tap()
    let firstSelected = expectation(for: NSPredicate(format: "selected == true"), evaluatedWith: first)
    wait(for: [firstSelected], timeout: 10)
    let firstGuides = expectation(for: NSPredicate { _, _ in guides().count == 2 }, evaluatedWith: app)
    wait(for: [firstGuides], timeout: 10)
    XCTAssertEqual(guides().count, 2)
    XCTAssertEqual(wait("twin-guide-start").frame.midX, first.frame.minX, accuracy: 3)
    XCTAssertEqual(wait("twin-guide-end").frame.midX, first.frame.maxX, accuracy: 3)
    XCTAssertGreaterThan(el("twin-guide-start").frame.maxY, candidates.frame.minY)
    try capture("single-selection")
    second.tap()
    let secondSelected = expectation(for: NSPredicate(format: "selected == true"), evaluatedWith: second)
    wait(for: [secondSelected], timeout: 10)
    let secondGuides = expectation(for: NSPredicate { _, _ in guides().count == 2 }, evaluatedWith: app)
    wait(for: [secondGuides], timeout: 10)
    XCTAssertEqual(guides().count, 2, "Multiple duties must share one pair of outer guides")
    XCTAssertEqual(el("twin-guide-start").frame.midX, min(first.frame.minX, second.frame.minX), accuracy: 3)
    XCTAssertEqual(el("twin-guide-end").frame.midX, max(first.frame.maxX, second.frame.maxX), accuracy: 3)
    let beforeRows = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'twin-crew-'")).allElementsBoundByIndex.filter { $0.isHittable }.map(\.identifier)
    candidates.swipeUp()
    let afterRows = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'twin-crew-'")).allElementsBoundByIndex.filter { $0.isHittable }.map(\.identifier)
    XCTAssertNotEqual(beforeRows, afterRows, "Candidate swipe must reveal different crews")
    XCTAssertEqual(ownRail.frame.minY, ownFrame.minY, accuracy: 1, "Own roster must stay pinned")
    XCTAssertEqual(first.frame.height, puckHeight, accuracy: 1)
    try capture("multiple-scroll")
    wait("twin-zoom-7").tap()
    let zoomSelected = expectation(for: NSPredicate(format: "selected == true"), evaluatedWith: el("twin-zoom-7"))
    wait(for: [zoomSelected], timeout: 10)
    XCTAssertEqual(first.frame.height, puckHeight, accuracy: 1, "Time zoom must preserve duty height")
    wait("twin-clear").tap()
    let cleared = expectation(for: NSPredicate { _, _ in guides().count == 0 && !first.isSelected && !second.isSelected }, evaluatedWith: app)
    wait(for: [cleared], timeout: 10)
    XCTAssertEqual(guides().count, 0)
    XCTAssertFalse(first.isSelected)
    XCTAssertFalse(second.isSelected)
    try capture("cleared")
    wait("twin-search-open").tap()
    wait("search-form")
    wait("search-close").tap()
    wait("twin-me-rail")
    if device != "duo" {
      XCUIDevice.shared.orientation = .portrait
      let portrait = expectation(for: NSPredicate { _, _ in self.appFrame.height > self.appFrame.width }, evaluatedWith: app)
      wait(for: [portrait], timeout: 10)
      XCTAssertTrue(wait("twin-search-open").isHittable)
      XCTAssertTrue(wait("twin-records").isHittable)
      XCTAssertTrue(wait("twin-my-duties").isHittable)
      try capture("portrait-cleared")
    }
    wait("page-back").tap()
    wait("tab-profile").tap()
    let add = el("profile-add-airline")
    if add.exists { add.tap() } else { wait("profile-logout").tap() }
    tapDialogConfirm("profile-dialog")
    wait("login-screen", 60)
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    XCTAssertEqual(el("crew-id").value as? String, "35459")
    wait("login-btn").tap()
    wait("home-screen", 30)
    wait("qa-duty-swap").tap()
    wait("page-swap")
    XCTAssertFalse(el("twin-screen").exists)
    XCTAssertFalse(text("473006").exists)
    XCTAssertEqual(guides().count, 0)
    try capture("tg-isolation")
  }

  /// Published PR duties through both real review flows. This test never sends.
  func testCompareFullDetailsAndTwinReviewAccountIsolation() throws {
    let device = ProcessInfo.processInfo.environment["TWIN_DEVICE"] ?? "air"
    let version = ProcessInfo.processInfo.environment["TWIN_VERSION"] ?? "1"
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["TWIN_SHOT_DIR"])
    func capture(_ state: String) throws {
      let name = "compare-full-details-\(device)-\(state)-Ver\(version)"
      if device == "duo" { shot(name) }
      else { try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png")) }
    }
    func approach(_ name: String) {
      let button = el("approach-\(name)")
      for _ in 0..<3 where !button.isHittable {
        if name == "matrix" { el("swap-approach-header").swipeRight() }
        else { el("swap-approach-header").swipeLeft() }
      }
      wait("approach-\(name)").tap()
      for id in ["swap-disclaimer", "twin-disclaimer"] {
        if el(id).waitForExistence(timeout: 3) { tapDialogConfirm(id) }
      }
      if el("app-dialog").exists && text("Before you swap").exists { tapDialogConfirm("app-dialog") }
    }
    func assertFullDetails(_ root: XCUIElement, state: String) throws {
      let scroll = root.descendants(matching: .scrollView).firstMatch
      for _ in 0..<6 { if text("Aircraft ").isHittable { break }; scroll.swipeUp() }
      let metadata = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Aircraft ' AND label CONTAINS 'BLH '")).allElementsBoundByIndex.first { $0.isHittable }
      let leg = try XCTUnwrap(metadata, "A complete visible Aircraft + BLH line is required in \(state)")
      XCTAssertFalse(leg.label.contains("…"), "Leg metadata must not be ellipsized")
      XCTAssertTrue(leg.label.range(of: #"Aircraft\s+\S+.*BLH\s+\d"#, options: .regularExpression) != nil, "Missing published aircraft/block-hour values: \(leg.label)")
      print("COMPARE_FULL_LEG \(device) \(state): \(leg.label)")
      let duty = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'review-duty-fdp-'")).firstMatch
      XCTAssertTrue(duty.exists, "Duty FDP must remain present on every device")
      XCTAssertTrue(duty.label.range(of: #"FDP\s+\d"#, options: .regularExpression) != nil, "Published duty FDP value missing")
      XCTAssertFalse(duty.label.contains("…"))
      let times = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'review-flight-times-'")).firstMatch
      XCTAssertTrue(times.exists, "Separate full leg time line missing")
      XCTAssertFalse(times.label.contains("…"))
      try capture(state)
      for _ in 0..<6 where !duty.isHittable { scroll.swipeDown() }
      XCTAssertTrue(duty.isHittable, "Duty FDP must be readable in the review viewport")
    }
    try signInAsPR("473006", usePrefilledPassword: true)
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 5) { tapDialogConfirm("swap-disclaimer") }
    if el("twin-disclaimer").exists { tapDialogConfirm("twin-disclaimer") }
    if el("app-dialog").exists && text("Before you swap").exists { tapDialogConfirm("app-dialog") }
    approach("matrix")
    if el("search-submit").waitForExistence(timeout: 5) { el("search-submit").tap() }
    wait("crew-matrix", 90)
    let own = try XCTUnwrap(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'duty-473006-PR' AND enabled == true")).allElementsBoundByIndex.first { $0.isHittable })
    print("COMPARE_MATRIX_GIVE: \(own.label)")
    own.tap()
    XCTAssertTrue(scrollToCrew("345945", wait("crew-matrix-scroll")))
    let other = try XCTUnwrap(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'duty-345945-PR' AND enabled == true")).allElementsBoundByIndex.first { $0.isHittable })
    print("COMPARE_MATRIX_TAKE: \(other.label)")
    other.tap()
    wait("swap-compare").tap()
    let compare = wait("compare-sheet")
    _ = wait("swap-delta", 60)
    try assertFullDetails(compare, state: "matrix")
    XCTAssertTrue(wait("swap-comment").isHittable)
    XCTAssertTrue(wait("swap-submit").isHittable)
    XCTAssertTrue(el("swap-submit").isEnabled)
    wait("compare-close").tap()
    approach("twin")
    wait("search-form", 100)
    let searchScroll = el("search-form").descendants(matching: .scrollView).firstMatch
    let filter = wait("search-crew-query")
    for _ in 0..<8 where !filter.isHittable { searchScroll.swipeUp() }
    replaceText(filter, with: "345945")
    wait("search-crew-345945", 30).tap()
    wait("search-submit").tap()
    wait("twin-crew-345945")
    wait("twin-zoom-7").tap()
    for crew in ["473006", "345945"] {
      let duty = try XCTUnwrap(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND enabled == true", "twin-duty-\(crew):")).allElementsBoundByIndex.first { $0.isHittable })
      print("COMPARE_TWIN_PICK \(crew): \(duty.label)")
      duty.tap()
    }
    if !el("twin-review").exists { wait("twin-review-open").tap() }
    wait("twin-delta", 60)
    for tab in ["date", "details"] {
      wait("twin-review-\(tab)").tap()
      let review = wait("twin-review")
      let scroll = review.descendants(matching: .scrollView).firstMatch
      for _ in 0..<8 { scroll.swipeDown() }
      try assertFullDetails(review, state: "twin-\(tab)")
      let note = wait("twin-note")
      for _ in 0..<10 where !note.isHittable { scroll.swipeUp() }
      XCTAssertTrue(note.isHittable)
      let send = wait("twin-send")
      for _ in 0..<3 where !send.isHittable { scroll.swipeUp() }
      XCTAssertTrue(send.isHittable)
      XCTAssertTrue(send.isEnabled)
      try capture("twin-\(tab)-footer")
    }
    wait("twin-review-back").tap()
    wait("page-back").tap()
    wait("tab-profile").tap()
    let add = el("profile-add-airline")
    if add.exists { add.tap() } else { wait("profile-logout").tap() }
    tapDialogConfirm("profile-dialog")
    wait("login-screen", 60)
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    XCTAssertEqual(el("crew-id").value as? String, "35459")
    wait("login-btn").tap()
    wait("home-screen", 30)
    wait("qa-duty-swap").tap()
    wait("page-swap")
    XCTAssertFalse(el("twin-screen").exists)
    XCTAssertFalse(el("compare-sheet").exists)
    XCTAssertFalse(text("473006").exists)
    XCTAssertFalse(text("345945").exists)
    try capture("tg-isolation")
  }

  /// iPad review folding keeps both rails usable and retains the local draft.
  /// Uses published PR duties and never submits the swap.
  func testTwinRailIPadReviewFoldingAndAccountIsolation() throws {
    let prCrew = "473006"
    let targetCrew = "345945"
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["TWIN_SHOT_DIR"])
    let version = ProcessInfo.processInfo.environment["TWIN_VERSION"] ?? "1"
    func capture(_ state: String) throws {
      try XCUIScreen.main.screenshot().pngRepresentation.write(to:
        URL(fileURLWithPath: directory).appendingPathComponent("twin-ipad-fold-review-\(state)-Ver\(version).png"))
    }
    func assertReviewClearOfLauncher() {
      let reviewButton = wait("twin-review-open")
      for id in ["dock-rbot", "rail-rbot"] {
        let launcher = el(id)
        if launcher.exists && launcher.isHittable {
          XCTAssertFalse(reviewButton.frame.intersects(launcher.frame), "Review must stay clear of the visible R'Bot launcher")
        }
      }
    }
    func rotate(_ orientation: UIDeviceOrientation) {
      XCUIDevice.shared.orientation = orientation
      let landscape = orientation == .landscapeLeft
      let rotated = expectation(for: NSPredicate { _, _ in
        landscape ? self.appFrame.width > self.appFrame.height : self.appFrame.height > self.appFrame.width
      }, evaluatedWith: app)
      wait(for: [rotated], timeout: 10)
      XCTAssertGreaterThanOrEqual(appFrame.width, 700, "Full-size iPad must retain the wide layout")
    }
    rotate(.portrait)
    try signInAsPR(prCrew, usePrefilledPassword: true)
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 8) { tapDialogConfirm("swap-disclaimer") }
    if el("app-dialog").exists && text("Before you swap").exists { tapDialogConfirm("app-dialog") }
    if el("twin-disclaimer").exists { tapDialogConfirm("twin-disclaimer") }
    if !el("approach-twin").isHittable { el("swap-approach-header").swipeLeft() }
    wait("approach-twin").tap()
    if el("twin-disclaimer").waitForExistence(timeout: 8) { tapDialogConfirm("twin-disclaimer") }
    let loaded = app.descendants(matching: .any).matching(NSPredicate(format: "identifier == 'search-form' OR identifier == 'twin-error'")).firstMatch
    XCTAssertTrue(loaded.waitForExistence(timeout: 100))
    XCTAssertFalse(el("twin-error").exists, "Portal did not supply duties")
    wait("search-submit").tap()
    for orientation: UIDeviceOrientation in [.portrait, .landscapeLeft] {
      rotate(orientation)
      XCTAssertFalse(el("twin-review").exists, "Review must start collapsed")
      XCTAssertGreaterThan(wait("twin-rails").frame.width, appFrame.width - 90, "Empty rails must use the available width")
      assertReviewClearOfLauncher()
      try capture(orientation == .portrait ? "portrait-empty" : "landscape-empty")
    }
    wait("twin-search-open").tap()
    wait("search-form")
    let searchScroll = el("search-form").descendants(matching: .scrollView).firstMatch
    let crewFilter = wait("search-crew-query")
    for _ in 0..<8 where !crewFilter.isHittable { searchScroll.swipeUp() }
    replaceText(crewFilter, with: targetCrew)
    wait("search-crew-\(targetCrew)", 30).tap()
    wait("search-submit").tap()
    wait("twin-crew-\(targetCrew)")
    wait("twin-zoom-7").tap()
    let fullWidth = wait("twin-rails").frame.width
    let give = try XCTUnwrap(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND enabled == true", "twin-duty-\(prCrew):")).allElementsBoundByIndex.first { $0.isHittable })
    let giveID = give.identifier
    give.tap()
    XCTAssertTrue(wait(giveID).isSelected)
    XCTAssertFalse(el("twin-review").exists, "A give alone must not open review")
    XCTAssertEqual(wait("twin-rails").frame.width, fullWidth, accuracy: 2)
    let take = try XCTUnwrap(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND enabled == true", "twin-duty-\(targetCrew):")).allElementsBoundByIndex.first { $0.isHittable })
    let takeID = take.identifier
    take.tap()
    let review = wait("twin-review")
    XCTAssertEqual(review.frame.width, 320, accuracy: 2)
    XCTAssertLessThanOrEqual(review.frame.width, appFrame.width * 0.4)
    XCTAssertGreaterThan(wait("twin-rails").frame.width, review.frame.width)
    wait("twin-delta", 45)
    let note = "Keep this iPad review draft"
    let noteField = wait("twin-note")
    let reviewScroll = review.descendants(matching: .scrollView).firstMatch
    for _ in 0..<4 where !noteField.isHittable { reviewScroll.swipeUp() }
    replaceText(noteField, with: note)
    if app.buttons["Hide keyboard"].isHittable { app.buttons["Hide keyboard"].tap() }
    try capture("landscape-open")
    wait("twin-review-back").tap()
    XCTAssertFalse(el("twin-review").exists)
    XCTAssertEqual(wait("twin-rails").frame.width, fullWidth, accuracy: 2)
    XCTAssertTrue(wait(giveID).isSelected)
    XCTAssertTrue(wait(takeID).isSelected)
    assertReviewClearOfLauncher()
    try capture("landscape-hidden")
    rotate(.portrait)
    XCTAssertGreaterThan(wait("twin-rails").frame.width, appFrame.width - 90)
    assertReviewClearOfLauncher()
    wait("twin-review-open").tap()
    XCTAssertEqual(wait("twin-review").frame.width, 320, accuracy: 2)
    XCTAssertGreaterThan(wait("twin-rails").frame.width, el("twin-review").frame.width)
    XCTAssertEqual(wait("twin-note").value as? String, note, "Hide and rotation must retain the note")
    XCTAssertTrue(wait(giveID).isSelected)
    XCTAssertTrue(wait(takeID).isSelected)
    try capture("portrait-reopened")
    wait("twin-clear").tap()
    XCTAssertFalse(el("twin-review").exists)
    XCTAssertGreaterThan(wait("twin-rails").frame.width, appFrame.width - 90)
    XCTAssertFalse(el(giveID).isSelected)
    XCTAssertFalse(el(takeID).isSelected)
    XCTAssertFalse(wait("twin-review-open").isEnabled)
    try capture("portrait-cleared")
    wait("page-back").tap()
    wait("tab-profile").tap()
    let add = el("profile-add-airline")
    if add.exists { add.tap() } else { wait("profile-logout").tap() }
    tapDialogConfirm("profile-dialog")
    wait("login-screen", 60)
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    XCTAssertEqual(el("crew-id").value as? String, "35459")
    wait("login-btn").tap()
    wait("home-screen", 30)
    wait("qa-duty-swap").tap()
    wait("page-swap")
    XCTAssertFalse(el("twin-screen").exists)
    XCTAssertFalse(text(prCrew).exists)
    XCTAssertFalse(el(giveID).exists)
    XCTAssertFalse(el(takeID).exists)
    try capture("tg-isolation")
  }

  /// Regression: the small phone landscape tray must leave candidate duties usable.
  /// Reads real published duties and reviews a local draft; never submits a swap.
  func testTwinRailSmallPhoneLandscapeDraftAndAccountIsolation() throws {
    let prCrew = ProcessInfo.processInfo.environment["TWIN_PR_CREW"] ?? "473006"
    let targetCrew = "345945"
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["TWIN_SHOT_DIR"])
    let version = ProcessInfo.processInfo.environment["TWIN_VERSION"] ?? "1"
    func capture(_ state: String) throws {
      try XCUIScreen.main.screenshot().pngRepresentation.write(to:
        URL(fileURLWithPath: directory).appendingPathComponent("twin-small-phone-\(state)-Ver\(version).png"))
    }
    XCUIDevice.shared.orientation = .portrait
    try signInAsPR(prCrew, usePrefilledPassword: true)
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 8) { tapDialogConfirm("swap-disclaimer") }
    if el("app-dialog").exists && text("Before you swap").exists { tapDialogConfirm("app-dialog") }
    if el("twin-disclaimer").exists { tapDialogConfirm("twin-disclaimer") }
    if !el("approach-twin").isHittable { el("swap-approach-header").swipeLeft() }
    wait("approach-twin").tap()
    if el("twin-disclaimer").waitForExistence(timeout: 8) { tapDialogConfirm("twin-disclaimer") }
    let loaded = app.descendants(matching: .any).matching(NSPredicate(format: "identifier == 'search-form' OR identifier == 'twin-error'")).firstMatch
    XCTAssertTrue(loaded.waitForExistence(timeout: 100))
    XCTAssertFalse(el("twin-error").exists, "Portal did not supply duties")
    wait("search-submit").tap()
    XCUIDevice.shared.orientation = .landscapeLeft
    let initialLandscape = expectation(for: NSPredicate { _, _ in self.appFrame.width > self.appFrame.height }, evaluatedWith: app)
    wait(for: [initialLandscape], timeout: 10)
    XCTAssertLessThan(appFrame.height, 560)
    XCTAssertTrue(wait("twin-me-rail").isHittable)
    let initialCandidate = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'twin-crew-'")).firstMatch
    XCTAssertTrue(initialCandidate.waitForExistence(timeout: 30))
    XCTAssertTrue(initialCandidate.isHittable, "Unfiltered candidates must retain a usable viewport")
    XCTAssertGreaterThan(initialCandidate.frame.intersection(appFrame).height, 40)
    XCTAssertLessThanOrEqual(wait("twin-tray").frame.height, 60)
    try capture("landscape-unfiltered")
    XCUIDevice.shared.orientation = .portrait
    let filterPortrait = expectation(for: NSPredicate { _, _ in self.appFrame.height > self.appFrame.width }, evaluatedWith: app)
    wait(for: [filterPortrait], timeout: 10)
    wait("twin-search-open").tap()
    wait("search-form")
    let searchScroll = el("search-form").descendants(matching: .scrollView).firstMatch
    let crewFilter = wait("search-crew-query")
    for _ in 0..<8 where !crewFilter.isHittable { searchScroll.swipeUp() }
    replaceText(crewFilter, with: targetCrew)
    wait("search-crew-\(targetCrew)", 30).tap()
    wait("search-submit").tap()
    wait("twin-crew-\(targetCrew)")
    wait("twin-zoom-7").tap()
    XCUIDevice.shared.orientation = .landscapeLeft
    let landscape = expectation(for: NSPredicate { _, _ in self.appFrame.width > self.appFrame.height }, evaluatedWith: app)
    wait(for: [landscape], timeout: 10)
    XCTAssertLessThan(appFrame.height, 560, "This regression requires a short landscape viewport")
    let ownRail = wait("twin-me-rail")
    let candidateRail = wait("twin-crew-\(targetCrew)")
    XCTAssertTrue(ownRail.isHittable, "Own rail must stay visible")
    XCTAssertTrue(candidateRail.isHittable, "Candidate row must have a usable viewport")
    XCTAssertGreaterThan(candidateRail.frame.intersection(appFrame).height, 40)
    XCTAssertLessThanOrEqual(wait("twin-tray").frame.height, 60, "Selection tray must leave space for candidates")
    try capture("landscape-empty")
    let ownPrefix = "twin-duty-\(prCrew):"
    let give = try XCTUnwrap(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND enabled == true", ownPrefix)).allElementsBoundByIndex.first { $0.isHittable }, "No published own duty in view")
    give.tap()
    let take = try XCTUnwrap(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@ AND enabled == true", "twin-duty-\(targetCrew):")).allElementsBoundByIndex.first { $0.isHittable }, "No published candidate duty in view")
    take.tap()
    let giveID = give.identifier
    let takeID = take.identifier
    XCTAssertEqual(give.frame.height, 40, accuracy: 1)
    XCTAssertEqual(take.frame.height, 40, accuracy: 1)
    XCTAssertTrue(el(giveID).isSelected)
    XCTAssertTrue(el(takeID).isSelected)
    XCTAssertLessThanOrEqual(wait("twin-tray").frame.height, 60)
    XCTAssertTrue(wait("twin-review-open").isEnabled)
    try capture("landscape-selected")
    wait("twin-review-open").tap()
    wait("twin-delta", 45)
    wait("twin-review-details").tap()
    XCTAssertTrue(text("ME · GIVE").exists)
    XCTAssertTrue(el("twin-note").exists)
    try capture("landscape-review")
    wait("twin-review-back").tap()
    XCTAssertTrue(wait(giveID).isSelected)
    XCTAssertTrue(wait(takeID).isSelected)
    XCUIDevice.shared.orientation = .portrait
    let portrait = expectation(for: NSPredicate { _, _ in self.appFrame.height > self.appFrame.width }, evaluatedWith: app)
    wait(for: [portrait], timeout: 10)
    XCTAssertTrue(wait(giveID).isSelected, "Give draft must survive rotation")
    XCTAssertTrue(wait(takeID).isSelected, "Take draft must survive rotation")
    XCTAssertEqual(el(giveID).frame.height, 40, accuracy: 1)
    XCTAssertEqual(el(takeID).frame.height, 40, accuracy: 1)
    XCTAssertTrue(wait("twin-review-open").isEnabled)
    try capture("portrait-retained")
    wait("page-back").tap()
    wait("tab-profile").tap()
    let add = el("profile-add-airline")
    if add.exists { add.tap() } else { wait("profile-logout").tap() }
    tapDialogConfirm("profile-dialog")
    wait("login-screen", 60)
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    XCTAssertEqual(el("crew-id").value as? String, "35459")
    wait("login-btn").tap()
    wait("home-screen", 30)
    wait("qa-duty-swap").tap()
    wait("page-swap")
    XCTAssertFalse(el("twin-screen").exists)
    XCTAssertFalse(text(prCrew).exists)
    XCTAssertFalse(el(giveID).exists)
    XCTAssertFalse(el(takeID).exists)
    try capture("tg-isolation")
  }

  /// Matrix | Market switch, then the Market: swap out of 487424's long trip on
  /// 22 Oct (PR104/PR105 MNL–SFO) and short duty on 29 Oct (PR890/PR891 MNL–TPE).
  /// The switch is a rail in the right-edge status strip on `wide`, in the header
  /// on `tall`. Unlocks the two duties first if needed (My duties, through the UI).
  /// DUO_MARKET_SENDS = requests to send per duty (default 2; 0 = layout only).
  /// Sends real requests on the PR TEST tenant (left pending, not withdrawn).
  func testDuoDutySwapMarketPR487424() throws {
    try signInAsPR("487424")
    let tag = layoutClass == .wide ? "wide" : "tall"
    wait("qa-duty-swap", 30).tap()
    if el("swap-disclaimer").waitForExistence(timeout: 20) { tapDialogConfirm("swap-disclaimer") }

    // The switch: right-edge status strip (wide) or the header (tall).
    if layoutClass == .wide {
      let edge = wait("swap-approach-rail-edge", 60)
      XCTAssertGreaterThan(edge.frame.minX, appFrame.maxX - 100, "rail should sit in the right-edge strip: \(edge.frame)")
      XCTAssertLessThan(edge.frame.minY, appFrame.minY + 200, "rail should sit under the clock: \(edge.frame)")
      XCTAssertFalse(el("swap-approach-header").exists, "no header switch when the rail holds it")
    } else {
      _ = wait("swap-approach-header", 60)
      XCTAssertFalse(el("swap-approach-rail-edge").exists, "no rail on the tall layout")
    }
    let toMarket = wait("approach-market")
    if !el("market-screen").exists {
      sleep(2)
      shot("m00_matrix_switch_\(tag)")
      toMarket.tap()
    }
    _ = wait("market-screen", 30)
    XCTAssertTrue(el("approach-market").isSelected, "Market should read as selected")

    // Nothing unlocked yet → My duties: unlock 22 Oct and 29 Oct.
    let ready = NSPredicate(format: "identifier == 'market-headline' OR identifier == 'market-error'")
    XCTAssertTrue(app.descendants(matching: .any).matching(ready).firstMatch.waitForExistence(timeout: 120), "market did not load")
    if el("market-unlock").exists {
      shot("m01_unlock_needed_\(tag)")
      el("market-unlock").tap()
      _ = wait("my-duties-save", 60)
      for code in ["PR104/PR105", "PR890/PR891"] {
        let sw = wait("my-duty-\(code)", 30)
        if !sw.label.contains("unlocked") { sw.tap() }
      }
      el("my-duties-save").tap()
      tapDialogConfirm("my-duties-saved", single: true)
      wait("page-back").tap()
    }
    let headline = wait("market-headline", 120)

    let want = Int(ProcessInfo.processInfo.environment["DUO_MARKET_SENDS"] ?? "2") ?? 2
    var sent: [String] = []
    for (day, label) in [("2026-10-22", "22–26 Oct"), ("2026-10-29", "29 Oct")] {
      wait("market-out-\(day)").tap()
      XCTAssertTrue(headline.waitForLabel(matching: "overlaps? \(label)$", timeout: 15), "headline: \(headline.label)")
      let board = wait("market-board")
      sleep(2)
      shot("m02_board_\(day)_\(tag)")
      if want == 0 {
        let first = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'offer-'")).firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 10), "no offers for \(day)")
        first.tap()
        _ = wait("market-delta", 60)
        sleep(1)
        shot("m03_composer_\(day)_\(tag)")
        wait("market-composer-close").tap()
        continue
      }
      var tried = Set<String>()
      var forDay = 0
      // One offer through the composer; true when the portal accepted it.
      func offer(_ card: XCUIElement) -> Bool {
        let id = card.identifier
        tried.insert(id)
        card.tap()
        _ = wait("market-composer", 15)
        _ = wait("market-delta", 60)
        let note = wait("market-note")
        note.tap()
        note.typeText("crew-app dev test: Market offer for \(day)")
        wait("market-send").tap()
        let result = wait("market-result", 210)
        let said = result.label
        print("DUO_MARKET_RESULT \(day) \(id): \(said)")
        let ok = said.contains("Request sent")
        if ok {
          sent.append("\(day) \(id)")
          shot("m04_sent_\(day)_\(forDay + 1)_\(tag)")
          // Done (left pill): back to the board, the card reads "Offered".
          result.coordinate(withNormalizedOffset: CGVector(dx: 0.34, dy: 1)).withOffset(CGVector(dx: 0, dy: -42)).tap()
          XCTAssertTrue(result.waitForNonExistence(timeout: 15), "result dialog did not close")
        } else {
          shot("m04_refused_\(day)_\(tried.count)_\(tag)")
          tapDialogConfirm("market-result", single: true) // Edit offer
          XCTAssertTrue(result.waitForNonExistence(timeout: 15), "result dialog did not close")
          wait("market-composer-close").tap()
        }
        XCTAssertTrue(el("market-composer").waitForNonExistence(timeout: 20), "composer did not close")
        return ok
      }
      let inView = { (e: XCUIElement) -> Bool in
        e.exists && e.isHittable && e.frame.minY >= board.frame.minY && e.frame.maxY <= board.frame.maxY
      }
      // 1. Likely-legal offers first (trip for trip, crew B free for mine — from a
      //    read-only probe of the market), found by scrolling the board.
      let prefer = (ProcessInfo.processInfo.environment["DUO_MARKET_PREFER"] ?? "").split(separator: ",").map { "offer-\($0)" }
      for id in prefer where forDay < want && !tried.contains(id) {
        let card = el(id)
        for _ in 0..<8 { board.swipeDown(velocity: .fast) }
        var found = inView(card)
        var n = 0
        while !found && n < 14 { board.swipeUp(velocity: .slow); n += 1; found = inView(card) }
        if found && !card.label.hasSuffix("offered") && offer(card) { forDay += 1 }
      }
      // 2. Then the board in order: the first untried offer in view.
      for _ in 0..<8 { board.swipeDown(velocity: .fast) }
      var swipes = 0
      while forDay < want && swipes < 25 {
        let cards = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'offer-'")).allElementsBoundByIndex
        guard let card = cards.first(where: { !tried.contains($0.identifier) && !$0.label.hasSuffix("offered") && inView($0) }) else {
          board.swipeUp(velocity: .slow)
          swipes += 1
          continue
        }
        if offer(card) { forDay += 1 }
      }
      XCTAssertGreaterThanOrEqual(forDay, want, "only \(forDay) request(s) sent for \(day)")
    }
    print("DUO_MARKET_SENT: \(sent)")
    sleep(1)
    shot("m05_done_\(tag)")
  }
}

extension XCUIElement {
  func waitForFocus(_ predicate: NSPredicate, timeout: TimeInterval) -> Bool {
    let end = Date().addingTimeInterval(timeout)
    repeat {
      if predicate.evaluate(with: self) { return true }
      usleep(100_000)
    } while Date() < end
    return false
  }

  /// Polls `label` until it matches the regex.
  func waitForLabel(matching pattern: String, timeout: TimeInterval) -> Bool {
    let end = Date().addingTimeInterval(timeout)
    repeat {
      if label.range(of: pattern, options: .regularExpression) != nil { return true }
      usleep(300_000)
    } while Date() < end
    return false
  }
}

extension DuoFitUITests {
  func testCalendarSharedScrollAndFolding() throws {
    let directory = try XCTUnwrap(ProcessInfo.processInfo.environment["CALENDAR_FIXED_SHOT_DIR"])
    let version = ProcessInfo.processInfo.environment["CALENDAR_FIXED_VERSION"] ?? "1"
    func capture(_ name: String) throws {
      let fileName = "calendar-shared-\(name)-Ver\(version)"
      if ProcessInfo.processInfo.environment["ROUTE_DEVICE"] == "duo" { shot(fileName) }
      else { try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(fileName).png")) }
    }
    func openCalendar() {
      wait("tab-schedule").tap()
      pickView("sched-view-calendar")
      wait("cal-month-detail")
    }
    if el("tab-profile").waitForExistence(timeout: 3) {
      wait("tab-profile").tap()
      let add = el("profile-add-airline")
      if add.exists { add.tap() } else { wait("profile-logout").tap() }
      tapDialogConfirm("profile-dialog")
      wait("login-screen")
    }
    let guestMode = ProcessInfo.processInfo.environment["CALENDAR_FIXED_GUEST"] == "1"
    if guestMode { wait("guest-login").tap(); wait("home-screen", 60) }
    else { try signInAsPR("473006", usePrefilledPassword: true) }
    openCalendar()
    for day in 19...25 {
      let cell = wait("cal-day-\(day)")
      if !cell.isHittable { wait("cal-compact").swipeUp() }
      cell.tap()
      wait("cal-to-detail").tap()
      wait("cal-detail")
      XCTAssertTrue(wait("cal-agenda-head").label.contains(" \(day) OCT"))
      let rail = wait("cal-day-rail")
      let events = wait("cal-daily-events")
      let scroll = wait("cal-daily-scroll")
      XCTAssertGreaterThan(rail.frame.height, 150)
      if ProcessInfo.processInfo.environment["ROUTE_DEVICE"] == "duo" {
        // The Duo navigates from the right-edge rail, so the agenda runs to the
        // bottom of the screen instead of stopping above a floating phone dock.
        XCTAssertLessThan(rail.frame.maxY, appFrame.maxY)
        XCTAssertGreaterThan(rail.frame.maxY, appFrame.maxY - 60)
      } else {
        XCTAssertLessThan(rail.frame.maxY, appFrame.maxY - 50)
      }
      let before = rail.frame
      try capture("\(guestMode ? "guest" : "pr")-day\(day)-top")
      let morning = wait("cal-section-MORNING")
      morning.tap()
      XCTAssertEqual(rail.frame.minY, before.minY, accuracy: 1)
      try capture("\(guestMode ? "guest" : "pr")-day\(day)-folded")
      morning.tap()
      let eventsY = events.frame.minY
      let canScroll = events.frame.height > scroll.frame.height + 20
      scroll.swipeUp()
      let upY = rail.frame.minY
      if canScroll { XCTAssertLessThan(upY, before.minY - 10, "rail must move upward with events") }
      XCTAssertEqual(upY - before.minY, events.frame.minY - eventsY, accuracy: 2, "events and rail must move together")
      XCTAssertEqual(rail.frame.height, before.height, accuracy: 1)
      try capture("\(guestMode ? "guest" : "pr")-day\(day)-scrolled")
      scroll.swipeDown()
      if canScroll { XCTAssertGreaterThan(rail.frame.minY, upY + 10, "rail must move downward with events") }
      XCTAssertEqual(rail.frame.height, before.height, accuracy: 1)
      wait("cal-to-compact").tap()
    }
    // Both compact layouts must place the daily panel directly under the grid.
    wait("cal-mode-toggle").tap()
    wait("cal-day-20").tap()
    for layout in ["month", "week"] {
      if layout == "week" { wait("cal-mode-toggle").tap() }
      let grid = wait("cal-fixed-month-grid")
      let heading = wait("cal-agenda-head")
      XCTAssertLessThan(heading.frame.minY - grid.frame.maxY, 32, "blank space above daily panel")
      let rail = wait("cal-day-rail")
      let events = wait("cal-daily-events")
      let before = rail.frame
      let eventY = events.frame.minY
      try capture("\(layout)-top")
      wait("cal-daily-scroll").swipeUp()
      XCTAssertEqual(rail.frame.height, before.height, accuracy: 1)
      XCTAssertEqual(rail.frame.minY - before.minY, events.frame.minY - eventY, accuracy: 2)
      try capture("\(layout)-scrolled")
      wait("cal-daily-scroll").swipeDown()
    }
    if ProcessInfo.processInfo.environment["ROUTE_DEVICE"] == "duo" {
      // The Duo has no bottom dock, so the route map must reach the bottom edge.
      pickView("sched-view-route")
      let map = wait("route-map")
      XCTAssertGreaterThan(map.frame.maxY, appFrame.maxY - 60, "route map should use the bottom of the Duo screen")
      try capture("route-full-height")
      pickView("sched-view-calendar")
    }
    if guestMode { return }
    wait("tab-profile").tap()
    let add = el("profile-add-airline")
    if add.exists { add.tap() } else { wait("profile-logout").tap() }
    tapDialogConfirm("profile-dialog")
    wait("login-screen")
    wait("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Thai")
    wait("airline-TG").tap()
    wait("login-btn").tap()
    wait("home-screen", 200)
    if app.buttons["Dismiss"].waitForExistence(timeout: 3) { app.buttons["Dismiss"].tap() }
    openCalendar()
    wait("cal-day-19").tap()
    wait("cal-to-detail").tap()
    let rail = wait("cal-day-rail")
    let height = rail.frame.height
    wait("cal-daily-scroll").swipeUp()
    XCTAssertEqual(rail.frame.height, height, accuracy: 1)
    try capture("tg-isolation")
    wait("tab-profile").tap()
    XCTAssertTrue(text("35459").waitForExistence(timeout: 10))
    XCTAssertFalse(text("473006").exists)
  }
}
