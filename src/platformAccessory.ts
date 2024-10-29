import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { Seam } from 'seam';
import { YaleLockPlatform } from './platform';
import { SeamLockDevice, SeamLockRequest } from './settings';

export class YaleLockAccessory {
  private service: Service;
  private device: SeamLockDevice;
  private pollInterval?: NodeJS.Timeout;

  constructor(
    private readonly platform: YaleLockPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly seam: Seam,
  ) {
    this.device = accessory.context.device;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Yale')
      .setCharacteristic(this.platform.Characteristic.Model, 'Yale Lock')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.device_id);

    this.service = this.accessory.getService(this.platform.Service.LockMechanism) ||
      this.accessory.addService(this.platform.Service.LockMechanism);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.properties.name);

    this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .onGet(this.getLockState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.LockTargetState)
      .onGet(this.getLockState.bind(this))
      .onSet(this.setLockState.bind(this));

    if (this.platform.config.pollInterval) {
      this.startPolling();
    }
  }

  private startPolling() {
    const interval = (this.platform.config.pollInterval || 10) * 1000;
    this.pollInterval = setInterval(async () => {
      try {
        const request: SeamLockRequest = { device_id: this.device.device_id };
        const lock = await this.seam.locks.get(request);
        
        if (lock && 'properties' in lock) {
          this.device = lock as SeamLockDevice;
          this.accessory.context.device = this.device;
          
          const lockState = this.device.properties.locked
            ? this.platform.Characteristic.LockCurrentState.SECURED
            : this.platform.Characteristic.LockCurrentState.UNSECURED;
            
          this.service.updateCharacteristic(
            this.platform.Characteristic.LockCurrentState,
            lockState,
          );
        }
      } catch (error) {
        this.platform.log.error('Error polling device status:', error);
      }
    }, interval);
  }

  async getLockState(): Promise<CharacteristicValue> {
    try {
      const request: SeamLockRequest = { device_id: this.device.device_id };
      const lock = await this.seam.locks.get(request);
      return lock.properties.locked
        ? this.platform.Characteristic.LockCurrentState.SECURED
        : this.platform.Characteristic.LockCurrentState.UNSECURED;
    } catch (error) {
      this.platform.log.error('Error getting lock state:', error);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }

  async setLockState(value: CharacteristicValue) {
    try {
      const request: SeamLockRequest = { device_id: this.device.device_id };
      if (value === this.platform.Characteristic.LockTargetState.SECURED) {
        await this.seam.locks.lockDoor(request);
      } else {
        await this.seam.locks.unlockDoor(request);
      }
    } catch (error) {
      this.platform.log.error('Error setting lock state:', error);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }
}