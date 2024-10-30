import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { SeamLockAccessory } from './platformAccessory.js';

export class SeamLockPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    if (!config.apiKey || !config.deviceId) {
      this.log.error('Missing required configuration. Please check your config.json');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    const uuid = this.api.hap.uuid.generate(this.config.deviceId);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
      new SeamLockAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding new accessory');
      const accessory = new this.api.platformAccessory('Seam Lock', uuid);
      new SeamLockAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}