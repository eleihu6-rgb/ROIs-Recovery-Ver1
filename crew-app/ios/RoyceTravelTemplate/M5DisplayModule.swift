import CoreBluetooth
import Foundation
import React

@objc(M5DisplayModule)
class M5DisplayModule: RCTEventEmitter, CBCentralManagerDelegate, CBPeripheralDelegate {
  private let serviceUUID = CBUUID(string: "7D2A0001-6C6F-4F69-732D-435245570001")
  private let snapshotUUID = CBUUID(string: "7D2A0002-6C6F-4F69-732D-435245570001")
  private let pairedPeripheralKey = "m5CrewDisplayPeripheralId"
  private var central: CBCentralManager?
  private var peripheral: CBPeripheral?
  private var snapshotCharacteristic: CBCharacteristic?
  private var pendingSnapshot: Data?
  private var reconnect = false
  private var listeners = false
  private var status = "disconnected"

  @objc override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override init() {
    super.init()
    reconnect = UserDefaults.standard.string(forKey: pairedPeripheralKey) != nil
    if reconnect {
      ensureCentral()
    }
  }

  override func supportedEvents() -> [String]! {
    ["M5DisplayStatus"]
  }

  override func startObserving() {
    listeners = true
  }

  override func stopObserving() {
    listeners = false
  }

  @objc(getStatus:rejecter:)
  func getStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    ensureCentral()
    resolve(status)
  }

  @objc(connect:rejecter:)
  func connect(_ resolve: @escaping RCTPromiseResolveBlock,
               rejecter reject: @escaping RCTPromiseRejectBlock) {
    reconnect = true
    ensureCentral()
    guard let central else {
      reject("ble_unavailable", "Bluetooth is unavailable on this device.", nil)
      return
    }
    guard central.state == .poweredOn else {
      updateStatus(statusForCentralState(central.state))
      resolve(nil)
      return
    }
    startConnection()
    resolve(nil)
  }

  @objc(disconnect:rejecter:)
  func disconnect(_ resolve: @escaping RCTPromiseResolveBlock,
                  rejecter reject: @escaping RCTPromiseRejectBlock) {
    reconnect = false
    UserDefaults.standard.removeObject(forKey: pairedPeripheralKey)
    if let peripheral, let central {
      central.cancelPeripheralConnection(peripheral)
    }
    self.peripheral = nil
    snapshotCharacteristic = nil
    updateStatus("disconnected")
    resolve(nil)
  }

  @objc(sendSnapshot:resolver:rejecter:)
  func sendSnapshot(_ payload: String,
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let data = payload.data(using: .utf8), data.count <= 256 else {
      reject("bad_payload", "The M5 trip summary is too large.", nil)
      return
    }
    pendingSnapshot = data
    if let peripheral, let characteristic = snapshotCharacteristic,
       peripheral.state == .connected {
      peripheral.writeValue(data, for: characteristic, type: .withResponse)
    } else if reconnect {
      ensureCentral()
      if central?.state == .poweredOn {
        startConnection()
      }
    }
    resolve(nil)
  }

  private func ensureCentral() {
    guard central == nil else { return }
    central = CBCentralManager(delegate: self, queue: .main)
  }

  private func updateStatus(_ next: String) {
    guard status != next else { return }
    status = next
    if listeners {
      sendEvent(withName: "M5DisplayStatus", body: next)
    }
  }

  private func statusForCentralState(_ state: CBManagerState) -> String {
    switch state {
    case .poweredOff:
      return "bluetooth-off"
    case .unauthorized:
      return "permission-denied"
    case .unsupported:
      return "unsupported"
    default:
      return "disconnected"
    }
  }

  private func startConnection() {
    guard reconnect, let central, central.state == .poweredOn else { return }
    if peripheral?.state == .connected || peripheral?.state == .connecting {
      return
    }
    if let saved = UserDefaults.standard.string(forKey: pairedPeripheralKey),
       let identifier = UUID(uuidString: saved),
       let known = central.retrievePeripherals(withIdentifiers: [identifier]).first {
      peripheral = known
      known.delegate = self
      updateStatus("connecting")
      central.connect(known)
      return
    }
    guard !central.isScanning else { return }
    updateStatus("scanning")
    central.scanForPeripherals(withServices: [serviceUUID], options: [
      CBCentralManagerScanOptionAllowDuplicatesKey: false,
    ])
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    guard central.state == .poweredOn else {
      updateStatus(statusForCentralState(central.state))
      return
    }
    if reconnect {
      startConnection()
    } else {
      updateStatus("disconnected")
    }
  }

  func centralManager(_ central: CBCentralManager,
                      didDiscover peripheral: CBPeripheral,
                      advertisementData: [String: Any],
                      rssi RSSI: NSNumber) {
    central.stopScan()
    self.peripheral = peripheral
    peripheral.delegate = self
    updateStatus("connecting")
    central.connect(peripheral)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    UserDefaults.standard.set(peripheral.identifier.uuidString, forKey: pairedPeripheralKey)
    peripheral.discoverServices([serviceUUID])
  }

  func centralManager(_ central: CBCentralManager,
                      didFailToConnect peripheral: CBPeripheral,
                      error: Error?) {
    handleDisconnect()
  }

  func centralManager(_ central: CBCentralManager,
                      didDisconnectPeripheral peripheral: CBPeripheral,
                      error: Error?) {
    handleDisconnect()
  }

  private func handleDisconnect() {
    snapshotCharacteristic = nil
    updateStatus("disconnected")
    guard reconnect else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
      self?.startConnection()
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard error == nil,
          let service = peripheral.services?.first(where: { $0.uuid == serviceUUID }) else {
      central?.cancelPeripheralConnection(peripheral)
      return
    }
    peripheral.discoverCharacteristics([snapshotUUID], for: service)
  }

  func peripheral(_ peripheral: CBPeripheral,
                  didDiscoverCharacteristicsFor service: CBService,
                  error: Error?) {
    guard error == nil,
          let characteristic = service.characteristics?.first(where: { $0.uuid == snapshotUUID }) else {
      central?.cancelPeripheralConnection(peripheral)
      return
    }
    snapshotCharacteristic = characteristic
    updateStatus("connected")
    if let pendingSnapshot {
      peripheral.writeValue(pendingSnapshot, for: characteristic, type: .withResponse)
    }
  }
}
