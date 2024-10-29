import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { Seam } from 'seam';
import { YaleLockAccessory } from './platformAccessory';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

export class YaleLockPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];
  private readonly seam: Seam;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // Initialize Seam with API key
    this.seam = new Seam({
      apiKey: config.seamApiKey as string
    });

    if (!config.seamApiKey) {
      this.log.error('No Seam API key provided. Plugin will not load.');
      return;
    }

    this.log.debug('Finished initializing platform:', config.name);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
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
        const uuid = this.api.hap.uuid.generate(lock.device_id);
        const existingAccessory = this.accessories.get(uuid);

        if (existingAccessory) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          existingAccessory.context.device = lock;
          this.api.updatePlatformAccessories([existingAccessory]);
          new YaleLockAccessory(this, existingAccessory, this.seam);
        } else {
          this.log.info('Adding new accessory:', lock.properties.name);
          const accessory = new this.api.platformAccessory(lock.properties.name, uuid);
          accessory.context.device = lock;
          new YaleLockAccessory(this, accessory, this.seam);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }

        this.discoveredCacheUUIDs.push(uuid);
      }

      // Remove stale accessories
      for (const [uuid, accessory] of this.accessories) {
        if (!this.discoveredCacheUUIDs.includes(uuid)) {
          this.log.info('Removing existing accessory from cache:', accessory.displayName);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    } catch (error) {
      this.log.error('Error discovering devices:', error);
    }
  }
}