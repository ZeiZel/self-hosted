import { Module } from '@nestjs/common';
import { BalancingService } from './balancing.service';
import { ConstraintsService } from './constraints.service';
import { MigratorService } from './migrator.service';
import { PresetsService } from './presets.service';
import {
  BinPackingStrategy,
  RoundRobinStrategy,
  WeightedStrategy,
  AffinityStrategy,
  SpreadStrategy,
} from './strategies';
import { InventoryModule } from '../inventory/inventory.module';
import { ServicesModule } from '../services/services.module';
import { HostModule } from '../host/host.module';

/**
 * Balancing module for service placement optimization
 * ConfigModule is @Global() so no explicit import needed
 */
@Module({
  imports: [
    InventoryModule,
    ServicesModule,
    HostModule,
  ],
  providers: [
    // Strategies
    BinPackingStrategy,
    RoundRobinStrategy,
    WeightedStrategy,
    AffinityStrategy,
    SpreadStrategy,
    // Services
    ConstraintsService,
    MigratorService,
    PresetsService,
    BalancingService,
  ],
  exports: [
    BalancingService,
    ConstraintsService,
    MigratorService,
    PresetsService,
  ],
})
export class BalancingModule {}
