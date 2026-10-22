import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type M5DisplayConnectionState =
  | 'unsupported'
  | 'permission-denied'
  | 'bluetooth-off'
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected';

interface M5DisplayNativeModule {
  getStatus(): Promise<M5DisplayConnectionState>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendSnapshot(payload: string): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const nativeModule = NativeModules.M5DisplayModule as M5DisplayNativeModule | undefined;

export function isM5DisplayAvailable(): boolean {
  return Platform.OS === 'ios' && nativeModule != null;
}

export async function getM5DisplayStatus(): Promise<M5DisplayConnectionState> {
  if (!isM5DisplayAvailable()) {
    return 'unsupported';
  }
  return nativeModule!.getStatus();
}

export async function connectM5Display(): Promise<void> {
  if (!isM5DisplayAvailable()) {
    throw new Error('M5 Crew Display requires an iPhone with Bluetooth.');
  }
  await nativeModule!.connect();
}

export async function disconnectM5Display(): Promise<void> {
  if (isM5DisplayAvailable()) {
    await nativeModule!.disconnect();
  }
}

export async function sendM5DisplaySnapshot(payload: string): Promise<void> {
  if (!isM5DisplayAvailable()) {
    return;
  }
  await nativeModule!.sendSnapshot(payload);
}

export function subscribeM5DisplayStatus(
  listener: (status: M5DisplayConnectionState) => void,
): () => void {
  if (!nativeModule) {
    return () => undefined;
  }
  const emitter = new NativeEventEmitter(NativeModules.M5DisplayModule);
  const subscription = emitter.addListener('M5DisplayStatus', listener);
  return () => subscription.remove();
}
