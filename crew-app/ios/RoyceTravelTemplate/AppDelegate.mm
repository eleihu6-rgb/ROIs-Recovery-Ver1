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
