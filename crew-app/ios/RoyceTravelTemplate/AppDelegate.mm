#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

// Generated Swift header — exposes @objc Swift classes (MeetingBackgroundSync) to
// Obj-C++ file. Named "<ProductModuleName>-Swift.h".
#import "RoyceTravelTemplate-Swift.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions

{
  self.moduleName = @"RoyceTravelTemplate";
  // You can add custom initial props in the dictionary below.
  // They will be passed down to ViewController used by React Native.
  self.initialProps = @{};

  // SettingsManager exposes NSUserDefaults to JavaScript. Publish build-time
  // Info.plist values before React Native initializes its native modules.
  NSString *ekRosterApiBaseURL =
      [[NSBundle mainBundle] objectForInfoDictionaryKey:@"EKRosterApiBaseURL"];
  if (ekRosterApiBaseURL.length > 0) {
    [[NSUserDefaults standardUserDefaults]
        registerDefaults:@{@"EKRosterApiBaseURL": ekRosterApiBaseURL}];
  }

  NSString *f8RosterApiBaseURL =
      [[NSBundle mainBundle] objectForInfoDictionaryKey:@"F8RosterApiBaseURL"];
  if (f8RosterApiBaseURL.length > 0) {
    [[NSUserDefaults standardUserDefaults]
        registerDefaults:@{@"F8RosterApiBaseURL": f8RosterApiBaseURL}];
  }

  // Background meeting refresh: register BGTask handler BEFORE launch finishes
  // (required by BGTaskScheduler), then request the first run.
  [MeetingBackgroundSync register];
  [MeetingBackgroundSync schedule];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (void)applicationDidEnterBackground:(UIApplication *)application

{
  // Re-arm periodic refresh when the app enters the background.
  [MeetingBackgroundSync schedule];
}

// RCTAppDelegate builds self.window via -initWithFrame: in
// -application:didFinishLaunchingWithOptions:, but never attaches it to a
// UIWindowScene. With UIApplicationSceneManifest declared (required on iOS 27+
// to avoid the no-scene-lifecycle-adoption runtime trap), an unattached window
// never composites — the app runs (JS mounts fine) but nothing is drawn.
- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions API_AVAILABLE(ios(13.0))
{
  if ([scene isKindOfClass:[UIWindowScene class]]) {
    // UIKit instantiates AppDelegate again as the scene delegate (a SEPARATE
    // object from the UIApplicationDelegate singleton), so `self.window` here
    // is nil — the real, content-filled window lives on the app delegate
    // singleton built in -application:didFinishLaunchingWithOptions:. Re-home
    // that window's rootViewController into a window properly attached to
    // this scene via the designated -initWithWindowScene: initializer.
    AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
    UIWindowScene *windowScene = (UIWindowScene *)scene;
    UIViewController *rootViewController = appDelegate.window.rootViewController;
    appDelegate.window = [[UIWindow alloc] initWithWindowScene:windowScene];
    appDelegate.window.rootViewController = rootViewController;
    [appDelegate.window makeKeyAndVisible];
  }
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge

{
  return [self bundleURL];
}

- (NSURL *)bundleURL

{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
