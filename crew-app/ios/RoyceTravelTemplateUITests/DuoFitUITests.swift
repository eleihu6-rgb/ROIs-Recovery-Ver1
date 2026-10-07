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
    shot("05_calendar")

    // R'Bot: back chevron on the LEFT on the wide layout.
    wait("dock-rbot").tap()
    let back = wait("rbot-close")
    XCTAssertLessThan(back.frame.midX, frame.midX, "R'Bot back button should be on the left")
    shot("06_rbot")
    back.tap()

    // Profile: Log Out must be reachable (not hidden behind the dock).
    wait("tab-profile").tap()
    XCTAssertTrue(text(crewId).waitForExistence(timeout: 10), "Profile should show crew \(crewId)")
    shot("07_profile")
    let logout = wait("profile-logout")
    XCTAssertLessThan(logout.frame.maxY, dockHome.frame.minY, "Log Out is hidden behind the dock")
  }
}
