/**
 * Deploy TUI Module
 *
 * NestJS module that provides all services needed for the deployment TUI:
 * - DeployTuiService: Main orchestration service
 * - DAGManagerService: Task dependency graph management
 * - TaskExecutorService: Parallel task execution
 * - TaskBuilderService: Task graph construction
 */

import { Module } from '@nestjs/common';
import { DeployTuiService } from './services/deploy-tui.service';
import { DAGManagerService } from './services/dag-manager.service';
import { TaskExecutorService } from './services/task-executor.service';
import { TaskBuilderService } from './services/task-builder.service';
import { ServicesModule } from '../../services/services.module';

@Module({
  imports: [
    // Import ServicesModule for access to ServicesService
    ServicesModule,
  ],
  providers: [
    // Core services
    DAGManagerService,
    TaskExecutorService,
    TaskBuilderService,

    // Main orchestration service
    DeployTuiService,
  ],
  exports: [
    // Export main service for use in commands
    DeployTuiService,

    // Export other services for testing/direct access
    DAGManagerService,
    TaskExecutorService,
    TaskBuilderService,
  ],
})
export class DeployModule {}
