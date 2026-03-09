import { Module } from '@nestjs/common';
import { DaemonService } from './daemon.service';
import { HealthCheckerService } from './health-checker.service';
import { DaemonClientService } from './daemon-client.service';
import { DaemonInitService } from './daemon-init.service';
import { MonitorModule } from '../modules/monitor/monitor.module';
import { ConfigModule } from '../modules/config/config.module';

@Module({
  imports: [MonitorModule, ConfigModule],
  providers: [HealthCheckerService, DaemonClientService, DaemonInitService, DaemonService],
  exports: [DaemonService, DaemonClientService, HealthCheckerService],
})
export class DaemonModule {}
