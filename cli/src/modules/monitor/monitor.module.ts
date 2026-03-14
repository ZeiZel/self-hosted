import { Module } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { ClusterClientService } from './cluster-client.service';
import { MetricsStreamService } from './metrics-stream.service';
import { DaemonApiClient } from './daemon-api.client';
import { AlertsService } from './alerts.service';
import { TuiService } from './tui/tui.service';
import { InkTuiService } from './tui/ink-tui.service';
import { MetricsHistoryService } from './tui/data/metrics-history.service';
import { EndpointCheckerService } from './apis/endpoint-checker';
import { BalancingModule } from '../balancing/balancing.module';
import { ApiModule } from './apis/api.module';

@Module({
  imports: [BalancingModule, ApiModule],
  providers: [
    ClusterClientService,
    AlertsService,
    MetricsStreamService,
    DaemonApiClient,
    MetricsHistoryService,
    EndpointCheckerService,
    TuiService,
    InkTuiService,
    MonitorService,
  ],
  exports: [
    MonitorService,
    ClusterClientService,
    MetricsStreamService,
    DaemonApiClient,
    AlertsService,
    TuiService,
    InkTuiService,
    MetricsHistoryService,
    EndpointCheckerService,
    ApiModule,
  ],
})
export class MonitorModule {}
