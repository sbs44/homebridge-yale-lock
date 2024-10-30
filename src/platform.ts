import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { Seam } from 'seam';
import { UnlockButtonAccessory } from './platformAccessory';
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
      this.log.error('No Seam API key provided');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    try {
      const locks = await this.seam.locks.list();

      for (const lock of locks) {
        const uuid = this.api.hap.uuid.generate(`unlock_${lock.device_id}`);
        const existingAccessory = this.accessories.get(uuid);

        if (existingAccessory) {
          new UnlockButtonAccessory(this, existingAccessory, this.seam);
        } else {
          const accessory = new this.api.platformAccessory(`${lock.properties.name} Unlock`, uuid);
          accessory.context.device = lock;
          new UnlockButtonAccessory(this, accessory, this.seam);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    } catch (error) {
      this.log.error('Error discovering devices:', error);
    }
  }
}