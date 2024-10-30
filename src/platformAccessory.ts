import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { Seam } from 'seam';
import { YaleLockPlatform } from './platform';
import { SeamLockDevice } from './settings';

export class QuickUnlockAccessory {
  private service: Service;
  private device: SeamLockDevice;
  private isOperationInProgress = false;

  constructor(
    private readonly platform: YaleLockPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly seam: Seam,
  ) {
    this.device = accessory.context.device;

    // Configure the accessory
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Yale')
      .setCharacteristic(this.platform.Characteristic.Model, 'Yale Quick Unlock')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.device.device_id);

    // Use Switch service for the quick unlock button
    this.service = this.accessory.getService(this.platform.Service.Switch) || 
      this.accessory.addService(this.platform.Service.Switch);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name, 
      `${this.device.properties.name} Quick Unlock`
    );

    // Handle the switch being turned on
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getButtonState.bind(this))
      .onSet(this.handleUnlock.bind(this));
  }

  // Button always returns "off" state
  private async getButtonState(): Promise<CharacteristicValue> {
    return false;
  }

  // Handle the unlock operation
  private async handleUnlock(value: CharacteristicValue) {
    // Only process "turn on" actions
    if (!value || this.isOperationInProgress) {
      return;
    }

    this.isOperationInProgress = true;

    try {
      // Send unlock command immediately
      await this.seam.locks.unlockDoor({ 
        device_id: this.device.device_id 
      });

      // Reset switch state after short delay
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.platform.Characteristic.On,
          false
        );
        this.isOperationInProgress = false;
      }, 500);

    } catch (error) {
      this.platform.log.error('Quick unlock failed:', error);
      this.isOperationInProgress = false;
      
      // Reset switch state immediately on error
      this.service.updateCharacteristic(
        this.platform.Characteristic.On,
        false
      );
    }
  }
}