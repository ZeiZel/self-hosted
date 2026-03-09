import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';

/**
 * Inventory module for managing cluster machines
 * Uses MachineRepository from DatabaseModule (global)
 */
@Module({
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
