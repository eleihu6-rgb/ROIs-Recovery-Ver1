#import <React/RCTBridgeModule.h>

// Objective-C bridge exposing the Swift `MeetingLiveActivityModule` (ActivityKit)
// to React Native.
@interface RCT_EXTERN_MODULE(MeetingLiveActivityModule, NSObject)

RCT_EXTERN_METHOD(isEnabled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(startCountdown:(NSDictionary *)payload
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endAll:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
