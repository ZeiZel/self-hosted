/**
 * Deploy TUI Module
 *
 * This module provides a fullscreen terminal UI for deployment visualization
 * and control. It includes:
 * - DAG-based task orchestration
 * - Parallel task execution
 * - Real-time log streaming
 * - Interactive task management
 *
 * Usage:
 * ```typescript
 * import { DeployModule, DeployTuiService } from './modules/deploy/tui';
 *
 * // In your NestJS module
 * @Module({
 *   imports: [DeployModule],
 * })
 * export class AppModule {}
 *
 * // In your command/controller
 * const deployTui = app.get(DeployTuiService);
 * await deployTui.start({ dryRun: false, bypassPermissions: false });
 * ```
 */

// Module
export { DeployModule } from './deploy.module';

// Services
export {
  DeployTuiService,
  TUIDeployOptions,
  DeployTuiEvent,
  DAGManagerService,
  TaskExecutorService,
  TaskBuilderService,
} from './services';

// Interfaces
export * from './interfaces';

// Components
export * from './components';

// Hooks
export * from './hooks';
