import { Injectable, Inject } from '@nestjs/common';
import { TimeseriesRepository, TimeseriesMetricType, PredictionResult } from '../repositories/timeseries.repository';
import type { NodeMetrics, ServiceMetrics } from '../../interfaces/monitor.interface';

/**
 * Prediction alert
 */
export interface PredictionAlert {
  severity: 'warning' | 'critical';
  metricType: TimeseriesMetricType;
  targetId: string;
  message: string;
  currentValue: number;
  predictedValue: number;
  estimatedBreachTime: string;
  confidence: number;
}

/**
 * Service for resource usage prediction
 */
@Injectable()
export class PredictionService {
  private readonly thresholds = {
    warning: 75,
    critical: 90,
  };

  private readonly predictionHorizons = {
    short: 5 * 60, // 5 minutes
    medium: 30 * 60, // 30 minutes
    long: 60 * 60, // 1 hour
  };

  constructor(
    @Inject(TimeseriesRepository)
    private readonly timeseries: TimeseriesRepository,
  ) {}

  /**
   * Record node metrics for prediction
   */
  recordNodeMetrics(nodes: NodeMetrics[]): void {
    const points = nodes.flatMap(node => [
      {
        metricType: 'node_cpu' as TimeseriesMetricType,
        targetId: node.name,
        value: node.cpu.percent,
      },
      {
        metricType: 'node_memory' as TimeseriesMetricType,
        targetId: node.name,
        value: node.memory.percent,
      },
    ]);

    this.timeseries.recordBatch(points);
  }

  /**
   * Record pod/service metrics for prediction
   */
  recordServiceMetrics(services: ServiceMetrics[]): void {
    const points = services
      .filter(svc => svc.cpu.limit > 0 || svc.memory.limit > 0)
      .flatMap(svc => {
        const result = [];

        if (svc.cpu.limit > 0) {
          result.push({
            metricType: 'pod_cpu' as TimeseriesMetricType,
            targetId: `${svc.namespace}/${svc.name}`,
            value: (svc.cpu.used / svc.cpu.limit) * 100,
          });
        }

        if (svc.memory.limit > 0) {
          result.push({
            metricType: 'pod_memory' as TimeseriesMetricType,
            targetId: `${svc.namespace}/${svc.name}`,
            value: (svc.memory.used / svc.memory.limit) * 100,
          });
        }

        return result;
      });

    if (points.length > 0) {
      this.timeseries.recordBatch(points);
    }
  }

  /**
   * Record cluster-wide metrics
   */
  recordClusterMetrics(cpuPercent: number, memoryPercent: number): void {
    this.timeseries.recordBatch([
      { metricType: 'cluster_cpu', targetId: 'cluster', value: cpuPercent },
      { metricType: 'cluster_memory', targetId: 'cluster', value: memoryPercent },
    ]);
  }

  /**
   * Calculate all predictions
   */
  calculatePredictions(): PredictionResult[] {
    const results: PredictionResult[] = [];
    const metricTypes: TimeseriesMetricType[] = ['node_cpu', 'node_memory', 'cluster_cpu', 'cluster_memory'];

    for (const metricType of metricTypes) {
      const targets = this.timeseries.getUniqueTargets(metricType);

      for (const targetId of targets) {
        const prediction = this.timeseries.calculatePrediction(
          metricType,
          targetId,
          this.thresholds.critical,
          this.predictionHorizons.medium,
        );

        if (prediction && prediction.confidence >= 0.3) {
          results.push(prediction);
          this.timeseries.savePrediction(prediction);
        }
      }
    }

    return results;
  }

  /**
   * Get predictions that indicate potential problems
   */
  getAlerts(): PredictionAlert[] {
    const alerts: PredictionAlert[] = [];

    // Get predictions approaching warning threshold within 1 hour
    const warningPredictions = this.timeseries.getWarningPredictions(1, 0.5);

    for (const pred of warningPredictions) {
      const breachTime = new Date(pred.estimatedBreachTime!);
      const now = new Date();
      const hoursUntilBreach = (breachTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Critical if breach within 15 minutes
      const severity = hoursUntilBreach <= 0.25 ? 'critical' : 'warning';

      const metricName = this.formatMetricName(pred.metricType);
      const timeUntilBreach = this.formatTimeUntil(breachTime);

      alerts.push({
        severity,
        metricType: pred.metricType,
        targetId: pred.targetId,
        message: `${pred.targetId} ${metricName} predicted to reach ${this.thresholds.critical}% in ${timeUntilBreach}`,
        currentValue: pred.currentValue,
        predictedValue: pred.predictedValue,
        estimatedBreachTime: pred.estimatedBreachTime!,
        confidence: pred.confidence,
      });
    }

    // Sort by severity and time
    alerts.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'critical' ? -1 : 1;
      }
      return new Date(a.estimatedBreachTime).getTime() - new Date(b.estimatedBreachTime).getTime();
    });

    return alerts;
  }

  /**
   * Get predictions for a specific target
   */
  getTargetPredictions(targetId: string): PredictionResult[] {
    const predictions = this.timeseries.getPredictions();
    return predictions.filter(p => p.targetId === targetId);
  }

  /**
   * Get node predictions
   */
  getNodePredictions(nodeName: string): {
    cpu: PredictionResult | null;
    memory: PredictionResult | null;
  } {
    const cpuPrediction = this.timeseries.calculatePrediction(
      'node_cpu',
      nodeName,
      this.thresholds.critical,
      this.predictionHorizons.medium,
    );

    const memoryPrediction = this.timeseries.calculatePrediction(
      'node_memory',
      nodeName,
      this.thresholds.critical,
      this.predictionHorizons.medium,
    );

    return {
      cpu: cpuPrediction,
      memory: memoryPrediction,
    };
  }

  /**
   * Get cluster-wide predictions
   */
  getClusterPredictions(): {
    cpu: PredictionResult | null;
    memory: PredictionResult | null;
  } {
    return {
      cpu: this.timeseries.calculatePrediction(
        'cluster_cpu',
        'cluster',
        this.thresholds.critical,
        this.predictionHorizons.long,
      ),
      memory: this.timeseries.calculatePrediction(
        'cluster_memory',
        'cluster',
        this.thresholds.critical,
        this.predictionHorizons.long,
      ),
    };
  }

  /**
   * Clean old data
   */
  cleanup(retentionDays: number = 7): number {
    return this.timeseries.cleanOldData(retentionDays);
  }

  /**
   * Get statistics
   */
  getStats(): { dataPoints: number; uniqueTargets: number } {
    return {
      dataPoints: this.timeseries.getDataPointCount(),
      uniqueTargets: this.timeseries.getUniqueTargets().length,
    };
  }

  /**
   * Format metric name for display
   */
  private formatMetricName(metricType: TimeseriesMetricType): string {
    switch (metricType) {
      case 'node_cpu':
      case 'pod_cpu':
      case 'cluster_cpu':
        return 'CPU';
      case 'node_memory':
      case 'pod_memory':
      case 'cluster_memory':
        return 'memory';
      case 'node_disk':
        return 'disk';
      default:
        return metricType;
    }
  }

  /**
   * Format time until breach
   */
  private formatTimeUntil(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    if (diffMs < 0) return 'now';

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0
        ? `${hours}h ${remainingMinutes}m`
        : `${hours}h`;
    }

    return `${minutes}m`;
  }
}
