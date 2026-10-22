#import <RCTDefaultReactNativeFactoryDelegate.h>
#import <UIKit/UIKit.h>

@class RCTReactNativeFactory;

@interface SceneDelegate : RCTDefaultReactNativeFactoryDelegate <UIWindowSceneDelegate>

@property (nonatomic, strong) UIWindow *window;
@property (nonatomic, strong) RCTReactNativeFactory *reactNativeFactory;

@end
