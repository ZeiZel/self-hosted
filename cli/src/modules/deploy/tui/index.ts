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

// Services - runtime values
export {
  DeployTuiService,
  DAGManagerService,
  TaskExecutorService,
  TaskBuilderService,
} from './services';

// Services - type-only exports
export type { TUIDeployOptions, DeployTuiEvent } from './services';

// Interfaces - uses export type internally
export * from './interfaces';

// Components - all runtime values
export * from './components';

// Hooks - all runtime values
export * from './hooks';
