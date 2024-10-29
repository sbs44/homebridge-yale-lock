import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { Seam } from 'seam';
import { YaleLockPlatform } from './platform';
import { SeamLockDevice, SeamLockRequest } from './settings';

const LOCK_TIMEOUT = 15000; // 15 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

export class YaleLockAccessory {
  private service: Service;
  private device: SeamLockDevice;
  private pollInterval?: NodeJS.Timeout;
  private isLockOperationInProgress = false;

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
    const interval = (this.platform.config.pollInterval || 10) * 1000; // Convert to milliseconds
    
    this.pollInterval = setInterval(async () => {
      try {
        const request: SeamLockRequest = { 
          device_id: this.device.device_id,
          sync: true
        };
        
        const lock = await this.seam.locks.get(request);
        this.device = lock as SeamLockDevice;
        this.accessory.context.device = this.device;
        
        const lockState = this.device.properties.locked
          ? this.platform.Characteristic.LockCurrentState.SECURED
          : this.platform.Characteristic.LockCurrentState.UNSECURED;
          
        this.service.updateCharacteristic(
          this.platform.Characteristic.LockCurrentState,
          lockState
        );
      } catch (error) {
        this.platform.log.error('Error polling device status:', error);
      }
    }, interval);
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retryCount >= MAX_RETRIES) {
        throw error;
      }

      this.platform.log.debug(`Retrying operation, attempt ${retryCount + 1} of ${MAX_RETRIES}`);
      await this.wait(RETRY_DELAY);
      return this.retryOperation(operation, retryCount + 1);
    }
  }

  async getLockState(): Promise<CharacteristicValue> {
    try {
      const request: SeamLockRequest = { 
        device_id: this.device.device_id,
        sync: true // Force sync with device
      };
      
      const lock = await this.retryOperation(async () => {
        const result = await this.seam.locks.get(request);
        if (!result.properties.online) {
          throw new Error('Lock is offline');
        }
        return result;
      });

      return lock.properties.locked
        ? this.platform.Characteristic.LockCurrentState.SECURED
        : this.platform.Characteristic.LockCurrentState.UNSECURED;
    } catch (error) {
      this.platform.log.error('Error getting lock state:', error);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
      );
    }
  }

  async setLockState(value: CharacteristicValue) {
    if (this.isLockOperationInProgress) {
      this.platform.log.warn('Lock operation already in progress, skipping...');
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.RESOURCE_BUSY
      );
    }

    this.isLockOperationInProgress = true;

    try {
      const request: SeamLockRequest = { 
        device_id: this.device.device_id,
        sync: true // Force sync with device
      };

      await this.retryOperation(async () => {
        // Check if lock is online before attempting operation
        const lockStatus = await this.seam.locks.get(request);
        if (!lockStatus.properties.online) {
          throw new Error('Lock is offline');
        }

        // Create a promise that will reject after the timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Operation timed out')), LOCK_TIMEOUT);
        });

        // Create the lock/unlock promise
        const operationPromise = async () => {
          if (value === this.platform.Characteristic.LockTargetState.SECURED) {
            await this.seam.locks.lockDoor(request);
            this.platform.log.debug('Lock command sent successfully');
          } else {
            await this.seam.locks.unlockDoor(request);
            this.platform.log.debug('Unlock command sent successfully');
          }
        };

        // Race between the operation and the timeout
        await Promise.race([operationPromise(), timeoutPromise]);

        // Verify the operation succeeded
        await this.wait(1000); // Wait for lock to update
        const verifyStatus = await this.seam.locks.get(request);
        const expectedState = value === this.platform.Characteristic.LockTargetState.SECURED;
        
        if (verifyStatus.properties.locked !== expectedState) {
          throw new Error('Lock state verification failed');
        }
      });

      // Update the current state characteristic
      this.service.updateCharacteristic(
        this.platform.Characteristic.LockCurrentState,
        value === this.platform.Characteristic.LockTargetState.SECURED
          ? this.platform.Characteristic.LockCurrentState.SECURED
          : this.platform.Characteristic.LockCurrentState.UNSECURED
      );

    } catch (error) {
      this.platform.log.error('Error setting lock state:', error);
      
      // Update UI to show error state
      this.service.updateCharacteristic(
        this.platform.Characteristic.LockCurrentState,
        this.platform.Characteristic.LockCurrentState.JAMMED
      );

      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
      );
    } finally {
      this.isLockOperationInProgress = false;
    }
  }
}