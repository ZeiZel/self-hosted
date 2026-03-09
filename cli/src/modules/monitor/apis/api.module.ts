import { Module } from '@nestjs/common';
import { ConsulClient } from './consul.client';
import { PrometheusClient } from './prometheus.client';
import { VaultClient } from './vault.client';
import { TraefikClient } from './traefik.client';

@Module({
  providers: [ConsulClient, PrometheusClient, VaultClient, TraefikClient],
  exports: [ConsulClient, PrometheusClient, VaultClient, TraefikClient],
})
export class ApiModule {}
