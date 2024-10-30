// src/platformAccessory.ts
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { SeamLockPlatform } from './platform.js';

export class SeamLockAccessory {
  private service: Service;

  constructor(
    private readonly platform: SeamLockPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Seam')
      .setCharacteristic(this.platform.Characteristic.Model, 'Smart Lock')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'SL-001');

    this.service = this.accessory.getService(this.platform.Service.Switch) || 
      this.accessory.addService(this.platform.Service.Switch);

    this.service.setCharacteristic(this.platform.Characteristic.Name, 'Unlock Door');

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));
  }

  async setOn(value: CharacteristicValue) {
    if (value) {
      try {
        const response = await fetch('https://connect.getseam.com/locks/unlock_door', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.platform.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            device_id: this.platform.config.deviceId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to unlock: ${response.statusText}`);
        }

        this.platform.log.info('Successfully unlocked door');
        
        // Reset switch state after 1 second
        setTimeout(() => {
          this.service.updateCharacteristic(this.platform.Characteristic.On, false);
        }, 1000);
      } catch (error) {
        this.platform.log.error('Error unlocking door:', error);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    }
  }

  async getOn(): Promise<CharacteristicValue> {
    return false;
  }
}