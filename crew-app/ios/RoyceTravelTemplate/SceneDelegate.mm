#import "SceneDelegate.h"

#import <CoreBluetooth/CoreBluetooth.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTLinkingManager.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#import <RCTReactNativeFactory.h>

#import "RoyceTravelTemplate-Swift.h"

@implementation SceneDelegate

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }

  self.dependencyProvider = [RCTAppDependencyProvider new];
  self.reactNativeFactory = [[RCTReactNativeFactory alloc] initWithDelegate:self];

  UIWindowScene *windowScene = (UIWindowScene *)scene;
  self.window = [[UIWindow alloc] initWithWindowScene:windowScene];
  [self.reactNativeFactory
      startReactNativeWithModuleName:@"RoyceTravelTemplate"
                            inWindow:self.window
                       launchOptions:[self launchOptionsFromConnectionOptions:connectionOptions]];
}

- (void)sceneDidEnterBackground:(UIScene *)scene
{
  [MeetingBackgroundSync schedule];
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
  UIOpenURLContext *context = URLContexts.anyObject;
  if (context == nil) {
    return;
  }

  [RCTLinkingManager application:UIApplication.sharedApplication
                         openURL:context.URL
               sourceApplication:context.options.sourceApplication
                      annotation:context.options.annotation ?: [NSNull null]];
}

- (void)scene:(UIScene *)scene continueUserActivity:(NSUserActivity *)userActivity
{
  [RCTLinkingManager application:UIApplication.sharedApplication
            continueUserActivity:userActivity
              restorationHandler:^(__unused NSArray<id<UIUserActivityRestoring>> *restorableObjects) {
              }];
}

- (NSDictionary *)launchOptionsFromConnectionOptions:(UISceneConnectionOptions *)connectionOptions
{
  NSMutableDictionary *launchOptions = [NSMutableDictionary dictionary];

  UIOpenURLContext *URLContext = connectionOptions.URLContexts.anyObject;
  if (URLContext != nil) {
    launchOptions[UIApplicationLaunchOptionsURLKey] = URLContext.URL;
  }

  NSUserActivity *userActivity = connectionOptions.userActivities.anyObject;
  if (userActivity != nil) {
    launchOptions[UIApplicationLaunchOptionsUserActivityDictionaryKey] = @{
      UIApplicationLaunchOptionsUserActivityTypeKey : userActivity.activityType,
      @"UIApplicationLaunchOptionsUserActivityKey" : userActivity,
    };
  }

  return launchOptions;
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
