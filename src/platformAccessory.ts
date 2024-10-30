import { Service, PlatformAccessory } from 'homebridge';
import { Seam } from 'seam';
import { YaleLockPlatform } from './platform';
import { SeamLockDevice } from './settings';

export class UnlockButtonAccessory {
  private service: Service;

  constructor(
    private readonly platform: YaleLockPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly seam: Seam,
  ) {
    const device = accessory.context.device as SeamLockDevice;

    // Set up a stateless button (push-type switch)
    this.service = this.accessory.getService(this.platform.Service.StatelessProgrammableSwitch) ||
      this.accessory.addService(this.platform.Service.StatelessProgrammableSwitch);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      `${device.properties.name} Unlock`
    );

    // Handle button press using the proper stateless switch event
    this.service.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .onSet(async () => {
        try {
          await this.seam.locks.unlockDoor({ device_id: device.device_id });
        } catch (error) {
          this.platform.log.error('Unlock failed:', error);
        }
      });
  }
}