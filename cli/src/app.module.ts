import { Module } from '@nestjs/common';
import { ConfigModule } from './modules/config/config.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ServicesModule } from './modules/services/services.module';
import { HostModule } from './modules/host/host.module';
import { UiModule } from './modules/ui/ui.module';
import { BalancingModule } from './modules/balancing/balancing.module';
import { MonitorModule } from './modules/monitor/monitor.module';

@Module({
  imports: [
    ConfigModule,
    InventoryModule,
    ServicesModule,
    HostModule,
    UiModule,
    BalancingModule,
    MonitorModule,
  ],
})
export class AppModule {}
