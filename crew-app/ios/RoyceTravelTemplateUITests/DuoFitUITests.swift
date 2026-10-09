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

  private func replaceText(_ field: XCUIElement, with value: String, file: StaticString = #filePath, line: UInt = #line) {
    // Tap the field's far right so the caret lands AFTER the existing text — a
    // centre tap drops it mid-word and the deletes leave a prefix ("K1K1001").
    // The field's value can lag or read as the placeholder, so delete generously
    // and check what landed (a leftover "433" once made 452320 into 433452320).
    for _ in 0..<3 {
      field.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
      let current = (field.value as? String) ?? ""
      field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: max(current.count, 12) + 8))
      field.typeText(value)
      let now = (field.value as? String) ?? ""
      // A secure field reads back as bullets: compare lengths only.
      if now == value || (field.elementType == .secureTextField && now.count == value.count) { return }
    }
    XCTFail("could not type \(field.identifier): reads \((field.value as? String) ?? "")", file: file, line: line)
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
    wait("home-wide-row-1")
    wait("home-next-trip")
    wait("home-explore")
    XCTAssertTrue(text("Quick actions").exists, "Landscape keeps Quick actions beside the trip")
    try capture("pr-home-landscape")
    wait("tab-schedule").tap()
    wait("sched-view-rail")
    wait("sched-title")
    try capture("pr-schedule-landscape")
    wait("sched-view-calendar").tap()
    wait("cal-wide")
    wait("cal-timeline")
    try capture("pr-calendar-landscape")
    wait("sched-view-route").tap()
    wait("route-map")
    wait("route-details")
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
    wait("dest-SYD").tap()
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
    wait("cal-wide")
    wait("cal-timeline")
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
    // Selecting TG fills the existing TG test credentials through the real UI.
    let tgCrew = try XCTUnwrap(wait("crew-id").value as? String)
    XCTAssertFalse(tgCrew.isEmpty)
    XCTAssertNotEqual(tgCrew, "473006")
    wait("login-btn").tap()
    wait("home-screen", 200)
    wait("home-greeting")
    XCTAssertGreaterThanOrEqual(appFrame.width, 700)
    // Meal is shared by carriers; account isolation is asserted on Profile below.
    try capture("tg-home-landscape")
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
    let details = wait("route-details")
    XCTAssertLessThan(map.frame.maxX, details.frame.minX + 1, "map must be left of the details")
    XCTAssertEqual(map.frame.width, details.frame.width, accuracy: 40, "route map and details should split ~50/50")
    shot("04_route_map")
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
    wait("sched-view-calendar").tap(); _ = wait("cal-wide"); sleep(1)
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
    // Trip details: the ops grid under the first leg's times.
    wait("home-next-trip").tap()
    wait("page-trip-details")
    let grid = el("flight-ops-grid-0")
    // Trip details has no dock: scroll until the whole grid is on screen.
    for _ in 0..<6 where !(grid.exists && grid.frame.maxY < appFrame.maxY - 20) { app.swipeUp() }
    XCTAssertTrue(grid.exists, "ops grid missing on Trip details")
    for id in ["ops-std-0", "ops-etd-0", "ops-boarding-0", "ops-door-0", "ops-gate-0", "ops-belt-0"] {
      XCTAssertFalse(el(id).label.isEmpty, "\(id) has no value")
    }
    // No duplicates: STD and the gate read only in the grid.
    XCTAssertFalse(app.staticTexts["Arrival gate"].exists, "old gate row still shown")
    // Per leg: each leg card shows STD once (a two-leg trip shows two cards).
    XCTAssertEqual(grid.staticTexts.matching(NSPredicate(format: "label == 'STD'")).count, 1, "STD should read once on the leg card")
    shot("m02_trip_ops")
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

  /// The confirm pill of an AppDialog. The dialog card is one accessibility element
  /// (its buttons are not exposed to XCUITest or VoiceOver), so tap the pill by its
  /// place in the card: cancel | confirm, centred near the bottom.
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
      if addAirline.exists { addAirline.tap() } else { el("profile-logout").tap() }
      tapDialogConfirm("profile-dialog")
    }
    let pw = usePrefilledPassword ? nil : try XCTUnwrap(ProcessInfo.processInfo.environment["DUO_PR_PASSWORD"], "set TEST_RUNNER_DUO_PR_PASSWORD")
    wait("login-screen", 60)
    el("airline-dropdown").tap()
    replaceText(wait("airline-search"), with: "Philippine")
    wait("airline-PR").tap()
    replaceText(wait("crew-id"), with: id)
    if let pw { replaceText(wait("crew-pw"), with: pw) }
    if usePrefilledPassword {
      // iPad's number pad covers the login pill in portrait; dismiss it using
      // the system keyboard control before tapping the app's button.
      let hideKeyboard = app.buttons["Hide keyboard"]
      if hideKeyboard.waitForExistence(timeout: 3) && hideKeyboard.isHittable { hideKeyboard.tap() }
      if !el("login-btn").isHittable && ProcessInfo.processInfo.environment["IPAD_SHOT_DIR"] != nil {
        // Floating iPad number pad has no hittable Hide keyboard control.
        // Tapping non-interactive content dismisses it through the ScrollView.
        app.staticTexts["ALWAYS A WAY FORWARD"].tap()
      }
    }
    // Keyboard dismissal must not append digits to the prefilled ID.
    XCTAssertEqual(el("crew-id").value as? String, id, "crew ID changed while dismissing keyboard")
    XCTAssertFalse((el("crew-pw").value as? String ?? "").isEmpty, "password is empty")
    el("login-btn").tap()
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

  func testDutySwapRbotDoesNotLeakIntoTGAccount() throws {
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
    wait("page-swap")
    XCTAssertFalse(el("swap-rbot-panel").exists, "PR Duty Swap R'Bot must not appear for TG")
    wait("page-back").tap()
    wait("tab-profile").tap()
    XCTAssertTrue(text("35459").waitForExistence(timeout: 10), "TG crew identity missing")
    XCTAssertFalse(text("392923").exists, "PR crew leaked into TG")
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
      wait("cal-mode-stacked")
      wait("cal-grid")
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

      // Start in the stacked month view and select a real flying day from the
      // imported roster, rather than relying on a date that can age out.
      wait("cal-mode-stacked").tap()
      wait("cal-grid")
      assertWeekdayGeometry()
      try capture(crew, "stacked-month")

      wait("cal-mode-month-detail").tap()
      wait("cal-month-detail")
      assertWeekdayGeometry()
      XCTAssertFalse(el("cal-day-pane").exists, "month detail must not have a right-side day pane")
      XCTAssertFalse(el("cal-agenda-head").exists, "month-detail mode should not show the agenda")
      XCTAssertGreaterThan(wait("cal-month-detail").frame.width, appFrame.width * 0.75,
        "month detail should use the screen width")
      try capture(crew, "month-detail-grid")

      let flightDay = app.descendants(matching: .any)
        .matching(NSPredicate(format: "identifier MATCHES 'cal-day-[0-9]+' AND label CONTAINS ', flight duty'"))
        .firstMatch
      XCTAssertTrue(flightDay.waitForExistence(timeout: 30), "\(crew) has no populated flight date in this month")
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
      let detailID = "cal-detail"
      let detail = wait(detailID)
      let agendaHead = wait("cal-agenda-head")
      XCTAssertTrue(agendaHead.label.contains("\(day) "), "selected agenda date mismatch: \(agendaHead.label)")
      let agendaFlight = detail.descendants(matching: .any)
        .matching(NSPredicate(format: "label CONTAINS %@", flightCode))
        .firstMatch
      XCTAssertTrue(agendaFlight.waitForExistence(timeout: 10), "\(crew) selected day details are missing \(flightCode)")
      try capture(crew, "selected-day")

      wait("cal-toggle-hours").tap()
      let timeline = wait("cal-timeline")
      XCTAssertTrue(text("Day details").waitForExistence(timeout: 10), "hours mode toggle did not change to Day details")
      let timelineFlight = timeline.descendants(matching: .any)
        .matching(NSPredicate(format: "label CONTAINS %@", flightCode))
        .firstMatch
      XCTAssertTrue(timelineFlight.waitForExistence(timeout: 10), "hours mode is missing \(flightCode)")
      try capture(crew, "selected-day-hours")
      wait("cal-toggle-hours").tap()
      XCTAssertTrue(text("Hourly timeline").waitForExistence(timeout: 10), "day-details mode did not restore")
      let restoredFlight = detail.descendants(matching: .any)
        .matching(NSPredicate(format: "label CONTAINS %@", flightCode))
        .firstMatch
      XCTAssertTrue(restoredFlight.waitForExistence(timeout: 10), "day details did not restore \(flightCode)")

      // Every screen returns to the full-width month and keeps its selection.
      do {
        wait("cal-to-compact").tap()
        wait("cal-month-detail")
        XCTAssertFalse(el("cal-grid").exists, "month-detail mode fell back to stacked")
        XCTAssertFalse(el("cal-agenda-head").exists, "month-detail mode should not show the agenda")
        XCTAssertTrue(wait(dayID).isSelected, "returning to month detail lost the selected day")
        try capture(crew, "returned-month-detail")
      }

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
    pickView("sched-view-calendar"); _ = wait("cal-grid"); sleep(1)
    shot("t12_schedule_calendar")
    expectLayout("cal-wide", on: .wide)
    pickView("sched-view-route"); _ = wait("route-map"); sleep(1)
    shot("t13_schedule_route")
    expectLayout("route-grid", on: .tall)
    pickView("sched-view-timeline")

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
  // MARK: Market — Duty Swap design Concept A "Swap Board" (PR cabin crew 487424)

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
