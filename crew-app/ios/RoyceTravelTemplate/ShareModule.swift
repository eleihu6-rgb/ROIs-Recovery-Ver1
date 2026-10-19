import Foundation
import React
import UIKit

// ─── Route-map share card (native hand-off) ──────────────────────────────────
// JS renders the poster through react-native-svg and gives us the PNG as
// base64. iOS needs a real file on disk to type the item correctly for share
// extensions: a file URL is `public.png`, while raw NSData from a data: URL is
// only `public.data` and Instagram (the first target) will not accept it.
//
// The JS counterpart is src/features/v2/routeShare.ts (`shareImagePng`).

@objc(ShareModule)
class ShareModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(shareImage:resolver:rejecter:)
  func shareImage(_ base64: String,
                  resolver resolve: @escaping RCTPromiseResolveBlock,
                  rejecter reject: @escaping RCTPromiseRejectBlock) {
    let cleaned = base64.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let data = Data(base64Encoded: cleaned, options: [.ignoreUnknownCharacters]) else {
      reject("E_BAD_IMAGE", "The share picture could not be decoded.", nil)
      return
    }

    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("royce-route-\(UUID().uuidString).png")
    do {
      try data.write(to: url, options: .atomic)
    } catch {
      reject("E_WRITE", "The share picture could not be written.", error)
      return
    }

    DispatchQueue.main.async {
      guard let presenter = ShareModule.topViewController() else {
        reject("E_NO_PRESENTER", "No screen is available to share from.", nil)
        return
      }

      let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      // iPad presents the sheet in a popover and crashes without an anchor.
      if let popover = controller.popoverPresentationController {
        popover.sourceView = presenter.view
        popover.sourceRect = CGRect(
          x: presenter.view.bounds.midX,
          y: presenter.view.bounds.midY,
          width: 0,
          height: 0
        )
        popover.permittedArrowDirections = []
      }
      controller.completionWithItemsHandler = { _, _, _, _ in
        // The receiving app has copied the image by the time the sheet closes.
        try? FileManager.default.removeItem(at: url)
        // Resolve only now: the JS dialog stays mounted while the sheet is up.
        // Closing it earlier tears down the view controller that is presenting
        // the activity sheet, which dismisses the sheet with it.
        resolve(true)
      }
      presenter.present(controller, animated: true)
    }
  }

  private static func topViewController() -> UIViewController? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    guard let root = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController else {
      return nil
    }

    var top = root
    while let presented = top.presentedViewController {
      top = presented
    }
    if let navigation = top as? UINavigationController {
      return navigation.visibleViewController ?? navigation
    }
    if let tab = top as? UITabBarController {
      return tab.selectedViewController ?? tab
    }
    return top
  }
}
