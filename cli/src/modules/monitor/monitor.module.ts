import { Module } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { ClusterClientService } from './cluster-client.service';
import { MetricsStreamService } from './metrics-stream.service';
import { AlertsService } from './alerts.service';
import { TuiService } from './tui/tui.service';
import { BalancingModule } from '../balancing/balancing.module';

@Module({
  imports: [BalancingModule],
  providers: [
    ClusterClientService,
    AlertsService,
    MetricsStreamService,
    TuiService,
    MonitorService,
  ],
  exports: [
    MonitorService,
    ClusterClientService,
    MetricsStreamService,
    AlertsService,
    TuiService,
  ],
})
export class MonitorModule {}
