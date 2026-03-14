import { Module, forwardRef } from '@nestjs/common';
import { DaemonService } from './daemon.service';
import { HealthCheckerService } from './health-checker.service';
import { DaemonClientService } from './daemon-client.service';
import { DaemonInitService } from './daemon-init.service';
import { MetricsCollectorService } from './collectors/metrics-collector.service';
import { DaemonHttpServer } from './http/daemon-server';
import { MonitorModule } from '../modules/monitor/monitor.module';
import { ConfigModule } from '../modules/config/config.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [MonitorModule, ConfigModule, forwardRef(() => TelegramModule)],
  providers: [
    HealthCheckerService,
    DaemonClientService,
    DaemonInitService,
    DaemonService,
    MetricsCollectorService,
    DaemonHttpServer,
  ],
  exports: [
    DaemonService,
    DaemonClientService,
    HealthCheckerService,
    MetricsCollectorService,
    DaemonHttpServer,
  ],
})
export class DaemonModule {}
