#import "AppDelegate.h"

#import <CoreBluetooth/CoreBluetooth.h>
#import <React/RCTEventEmitter.h>

#import "RoyceTravelTemplate-Swift.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // SettingsManager exposes NSUserDefaults to JavaScript. Publish build-time
  // Info.plist values before the scene starts React Native native modules.
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

  // BGTaskScheduler requires registration before application launch finishes.
  [MeetingBackgroundSync register];
  [MeetingBackgroundSync schedule];

  return YES;
}

@end
