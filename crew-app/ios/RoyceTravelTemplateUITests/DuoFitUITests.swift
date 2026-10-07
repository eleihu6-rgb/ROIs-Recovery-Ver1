import XCTest

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
    app.launch()
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

  private func replaceText(_ field: XCUIElement, with value: String) {
    // Tap the field's far right so the caret lands AFTER the existing text — a
    // centre tap drops it mid-word and the deletes leave a prefix ("K1K1001").
    field.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
    let current = (field.value as? String) ?? ""
    if !current.isEmpty {
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
    }
    field.typeText(value)
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
    XCTAssertTrue(el("sched-master").exists, "Schedule should be master/detail on the wide layout")
    wait("sched-view-menu").tap()
    wait("sched-view-route").tap()
    let map = wait("route-map")
    let details = wait("route-details")
    XCTAssertLessThan(map.frame.maxX, details.frame.minX + 1, "map must be left of the details")
    XCTAssertEqual(map.frame.width, details.frame.width, accuracy: 40, "route map and details should split ~50/50")
    shot("04_route_map")
    wait("sched-view-menu").tap()
    wait("sched-view-calendar").tap()
    wait("cal-grid")
    XCTAssertTrue(el("cal-wide").exists, "Calendar should be grid | day pane on the wide layout")
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
    expectLayout("sched-master", on: .wide)
    wait("sched-view-menu").tap(); wait("sched-view-calendar").tap(); _ = wait("cal-grid"); sleep(1)
    shot("t12_schedule_calendar")
    expectLayout("cal-wide", on: .wide)
    wait("sched-view-menu").tap(); wait("sched-view-route").tap(); _ = wait("route-map"); sleep(1)
    shot("t13_schedule_route")
    expectLayout("route-grid", on: .tall)
    wait("sched-view-menu").tap(); wait("sched-view-timeline").tap()

    wait("tab-global").tap()
    if el("global-screen").waitForExistence(timeout: 10) { shot("t14_global") }

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
}
