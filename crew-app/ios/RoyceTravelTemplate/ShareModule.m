#import <React/RCTBridgeModule.h>

// Objective-C bridge exposing the Swift `ShareModule` to React Native.
@interface RCT_EXTERN_MODULE(ShareModule, NSObject)

RCT_EXTERN_METHOD(shareImage:(NSString *)base64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
