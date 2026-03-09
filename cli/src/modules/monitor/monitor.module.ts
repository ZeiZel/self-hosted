import { Module } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { ClusterClientService } from './cluster-client.service';
import { MetricsStreamService } from './metrics-stream.service';
import { AlertsService } from './alerts.service';
import { TuiService } from './tui/tui.service';
import { BalancingModule } from '../balancing/balancing.module';
import { ApiModule } from './apis/api.module';
import { ConsulClient } from './apis/consul.client';
import { PrometheusClient } from './apis/prometheus.client';
import { VaultClient } from './apis/vault.client';
import { TraefikClient } from './apis/traefik.client';

@Module({
  imports: [BalancingModule, ApiModule],
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
    ConsulClient,
    PrometheusClient,
    VaultClient,
    TraefikClient,
  ],
})
export class MonitorModule {}
