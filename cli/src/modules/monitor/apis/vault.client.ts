import { Injectable } from '@nestjs/common';
import { BaseApiClient } from './base-api.client';
import { ApiEndpoint, ApiHealthStatus, VaultState, VaultStatus } from './interfaces/api.interface';

/**
 * Vault API client
 */
@Injectable()
export class VaultClient extends BaseApiClient {
  protected serviceName = 'vault';
  protected defaultEndpoint: ApiEndpoint = {
    host: 'vault.service.svc.cluster.local',
    port: 8200,
    protocol: 'http',
    basePath: '/v1',
  };

  /**
   * Check Vault health
   */
  async checkHealth(): Promise<{ status: ApiHealthStatus; message?: string }> {
    // Vault health endpoint returns different status codes:
    // 200 - initialized, unsealed, active
    // 429 - unsealed, standby
    // 472 - DR secondary
    // 473 - performance standby
    // 501 - not initialized
    // 503 - sealed

    try {
      const url = this.buildUrl('/sys/health?standbyok=true&drsecondaryok=true');
      const response = await Bun.fetch(url, {
        signal: AbortSignal.timeout(this.options.timeout),
      });

      // Even 4xx/5xx responses can contain useful status info
      if (response.status === 200 || response.status === 429) {
        return { status: ApiHealthStatus.HEALTHY };
      }

      if (response.status === 503) {
        return {
          status: ApiHealthStatus.DEGRADED,
          message: 'Vault is sealed',
        };
      }

      if (response.status === 501) {
        return {
          status: ApiHealthStatus.DEGRADED,
          message: 'Vault is not initialized',
        };
      }

      return {
        status: ApiHealthStatus.DEGRADED,
        message: `Unexpected status: ${response.status}`,
      };
    } catch (error) {
      return {
        status: ApiHealthStatus.UNAVAILABLE,
        message: this.parseError(error),
      };
    }
  }

  /**
   * Get Vault seal status
   */
  async getSealStatus(): Promise<VaultStatus | null> {
    const response = await this.fetch<{
      initialized: boolean;
      sealed: boolean;
      version: string;
      cluster_name?: string;
      cluster_id?: string;
      progress?: number;
      nonce?: string;
    }>('/sys/seal-status');

    if (!response.success || !response.data) {
      return null;
    }

    const data = response.data;
    return {
      initialized: data.initialized,
      sealed: data.sealed,
      version: data.version,
      clusterName: data.cluster_name,
      haEnabled: false, // Will be updated from health
      standby: false,
    };
  }

  /**
   * Get Vault health info
   */
  async getHealthInfo(): Promise<VaultStatus | null> {
    try {
      const url = this.buildUrl('/sys/health?standbyok=true');
      const response = await Bun.fetch(url, {
        signal: AbortSignal.timeout(this.options.timeout),
      });

      const data = await response.json();

      return {
        initialized: data.initialized ?? false,
        sealed: data.sealed ?? true,
        version: data.version ?? 'unknown',
        clusterName: data.cluster_name,
        clusterLeader: data.leader_cluster_address,
        haEnabled: data.replication_dr_mode !== 'disabled',
        standby: data.standby ?? false,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if Vault is unsealed
   */
  async isUnsealed(): Promise<boolean> {
    const status = await this.getSealStatus();
    return status !== null && !status.sealed;
  }

  /**
   * Check if Vault is initialized
   */
  async isInitialized(): Promise<boolean> {
    const status = await this.getSealStatus();
    return status !== null && status.initialized;
  }

  /**
   * Get HA status (if HA is enabled)
   */
  async getHaStatus(): Promise<{
    haEnabled: boolean;
    isLeader: boolean;
    leaderAddress?: string;
  } | null> {
    const response = await this.fetch<{
      ha_enabled: boolean;
      is_self: boolean;
      leader_address?: string;
      leader_cluster_address?: string;
    }>('/sys/leader');

    if (!response.success || !response.data) {
      return null;
    }

    return {
      haEnabled: response.data.ha_enabled,
      isLeader: response.data.is_self,
      leaderAddress: response.data.leader_address,
    };
  }

  /**
   * Get full Vault state
   */
  async getState(): Promise<VaultState> {
    const healthCheck = await this.checkHealth();
    const status = await this.getHealthInfo();

    let health: ApiHealthStatus = ApiHealthStatus.UNKNOWN;
    if (healthCheck.status === ApiHealthStatus.HEALTHY) {
      health = ApiHealthStatus.HEALTHY;
    } else if (healthCheck.status === ApiHealthStatus.DEGRADED) {
      health = ApiHealthStatus.DEGRADED;
    } else {
      health = ApiHealthStatus.UNAVAILABLE;
    }

    return {
      available: healthCheck.status !== ApiHealthStatus.UNAVAILABLE,
      status: status || undefined,
      health,
      lastUpdated: new Date().toISOString(),
    };
  }
}
