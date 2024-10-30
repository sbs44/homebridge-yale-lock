import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { Seam } from 'seam';
import { QuickUnlockAccessory } from './platformAccessory';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

export class YaleLockPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  private readonly seam: Seam;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.seam = new Seam({
      apiKey: config.seamApiKey as string
    });

    if (!config.seamApiKey) {
      this.log.error('No Seam API key provided. Plugin will not load.');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    try {
      const locks = await this.seam.locks.list();

      for (const lock of locks) {
        // Generate unique ID for the quick unlock button
        const uuid = this.api.hap.uuid.generate(`quickunlock_${lock.device_id}`);
        const existingAccessory = this.accessories.get(uuid);

        if (existingAccessory) {
          this.log.info('Restoring existing quick unlock button:', existingAccessory.displayName);
          existingAccessory.context.device = lock;
          this.api.updatePlatformAccessories([existingAccessory]);
          new QuickUnlockAccessory(this, existingAccessory, this.seam);
        } else {
          this.log.info('Adding new quick unlock button for:', lock.properties.name);
          const accessory = new this.api.platformAccessory(`${lock.properties.name} Quick Unlock`, uuid);
          accessory.context.device = lock;
          new QuickUnlockAccessory(this, accessory, this.seam);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }

      // Clean up old accessories
      for (const [uuid, accessory] of this.accessories) {
        if (!locks.find(l => uuid === this.api.hap.uuid.generate(`quickunlock_${l.device_id}`))) {
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    } catch (error) {
      this.log.error('Error discovering devices:', error);
    }
  }
}