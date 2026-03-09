import { Injectable, Inject } from '@nestjs/common';
import { Subscription } from 'rxjs';
import chalk from 'chalk';
import {
  ClusterState,
  TuiPanel,
  TuiState,
  KEYBOARD_SHORTCUTS,
  MigrationRequest,
} from '../../../interfaces/monitor.interface';
import { MetricsStreamService } from '../metrics-stream.service';
import {
  renderNodesPanel,
  renderServicesPanel,
  renderSummaryPanel,
  renderAlertsPanel,
  renderMigrationPanel,
  MigrationPanelState,
} from './panels';

/**
 * TUI rendering service for the monitor dashboard
 * Uses ANSI escape codes for terminal manipulation
 */
@Injectable()
export class TuiService {
  private state: TuiState = {
    activePanel: TuiPanel.NODES,
    scrollOffset: 0,
    showHelp: false,
    showMigration: false,
  };

  private migrationState: MigrationPanelState = {
    visible: false,
    service: null,
    targetNodeIndex: 0,
    nodes: [],
  };

  private clusterState: ClusterState | null = null;
  private subscription: Subscription | null = null;
  private running = false;
  private onMigrate?: (request: MigrationRequest) => Promise<void>;

  constructor(@Inject(MetricsStreamService) private metricsStream: MetricsStreamService) {}

  /**
   * Start the TUI
   */
  async start(options: {
    refreshInterval?: number;
    onMigrate?: (request: MigrationRequest) => Promise<void>;
  } = {}): Promise<void> {
    this.running = true;
    this.onMigrate = options.onMigrate;

    // Setup terminal
    this.setupTerminal();

    // Start metrics streaming
    this.subscription = this.metricsStream
      .startStreaming(options.refreshInterval || 5)
      .subscribe((state) => {
        this.clusterState = state;
        this.render();
      });

    // Setup keyboard handling
    this.setupKeyboard();

    // Initial render
    this.render();
  }

  /**
   * Stop the TUI
   */
  stop(): void {
    this.running = false;
    this.subscription?.unsubscribe();
    this.metricsStream.stopStreaming();
    this.restoreTerminal();
  }

  /**
   * Setup terminal for TUI
   */
  private setupTerminal(): void {
    // Hide cursor
    process.stdout.write('\x1B[?25l');
    // Clear screen
    process.stdout.write('\x1B[2J');
    // Move to top-left
    process.stdout.write('\x1B[H');
    // Enable alternative screen buffer (optional)
    // process.stdout.write('\x1B[?1049h');
  }

  /**
   * Restore terminal
   */
  private restoreTerminal(): void {
    // Show cursor
    process.stdout.write('\x1B[?25h');
    // Clear screen
    process.stdout.write('\x1B[2J');
    // Move to top-left
    process.stdout.write('\x1B[H');
    // Disable alternative screen buffer
    // process.stdout.write('\x1B[?1049l');
  }

  /**
   * Setup keyboard input handling
   */
  private setupKeyboard(): void {
    if (!process.stdin.isTTY) return;

    // Enable raw mode
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key: string) => {
      this.handleKeypress(key);
    });
  }

  /**
   * Handle keypress
   */
  private handleKeypress(key: string): void {
    if (!this.running) return;

    // Handle special keys
    const keyCode = key.charCodeAt(0);

    // Ctrl+C or 'q' to quit
    if (keyCode === 3 || key === 'q') {
      this.stop();
      process.exit(0);
    }

    // Handle migration mode
    if (this.migrationState.visible) {
      this.handleMigrationKey(key);
      return;
    }

    switch (key) {
      case 'r':
        // Refresh
        this.metricsStream.refresh();
        break;

      case 'h':
        // Toggle help
        this.state.showHelp = !this.state.showHelp;
        this.render();
        break;

      case '\t':
        // Tab - switch panel
        this.switchPanel();
        break;

      case 'n':
        this.state.activePanel = TuiPanel.NODES;
        this.state.scrollOffset = 0;
        this.render();
        break;

      case 's':
        this.state.activePanel = TuiPanel.SERVICES;
        this.state.scrollOffset = 0;
        this.render();
        break;

      case 'a':
        this.state.activePanel = TuiPanel.ALERTS;
        this.state.scrollOffset = 0;
        this.render();
        break;

      case 'm':
        // Migration panel
        if (this.state.selectedService && this.clusterState) {
          this.showMigrationPanel();
        }
        break;

      case '\r':
      case '\n':
        // Enter - select/migrate
        if (this.state.activePanel === TuiPanel.SERVICES && this.state.selectedService) {
          this.showMigrationPanel();
        }
        break;

      case '\x1B[A':
      case 'k':
        // Up arrow
        this.navigateUp();
        break;

      case '\x1B[B':
      case 'j':
        // Down arrow
        this.navigateDown();
        break;

      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        // Quick select node
        this.quickSelectNode(parseInt(key, 10) - 1);
        break;
    }
  }

  /**
   * Handle keypress in migration mode
   */
  private handleMigrationKey(key: string): void {
    switch (key) {
      case '\x1B':
      case 'q':
        // Escape - cancel
        this.hideMigrationPanel();
        break;

      case '\x1B[A':
      case 'k':
        // Up
        if (this.migrationState.targetNodeIndex > 0) {
          this.migrationState.targetNodeIndex--;
          this.render();
        }
        break;

      case '\x1B[B':
      case 'j':
        // Down
        if (this.migrationState.targetNodeIndex < this.migrationState.nodes.length - 1) {
          this.migrationState.targetNodeIndex++;
          this.render();
        }
        break;

      case '\r':
      case '\n':
        // Enter - confirm migration
        this.executeMigration();
        break;
    }
  }

  /**
   * Switch to next panel
   */
  private switchPanel(): void {
    const panels = [TuiPanel.NODES, TuiPanel.SERVICES, TuiPanel.ALERTS];
    const currentIndex = panels.indexOf(this.state.activePanel);
    const nextIndex = (currentIndex + 1) % panels.length;
    this.state.activePanel = panels[nextIndex];
    this.state.scrollOffset = 0;
    this.render();
  }

  /**
   * Navigate up in current panel
   */
  private navigateUp(): void {
    if (this.state.scrollOffset > 0) {
      this.state.scrollOffset--;
      this.render();
    }
  }

  /**
   * Navigate down in current panel
   */
  private navigateDown(): void {
    const maxItems = this.getMaxItems();
    if (this.state.scrollOffset < maxItems - 1) {
      this.state.scrollOffset++;
      this.render();
    }
  }

  /**
   * Get max items in current panel
   */
  private getMaxItems(): number {
    if (!this.clusterState) return 0;

    switch (this.state.activePanel) {
      case TuiPanel.NODES:
        return this.clusterState.nodes.length;
      case TuiPanel.SERVICES:
        return this.clusterState.services.length;
      case TuiPanel.ALERTS:
        return this.clusterState.alerts.length;
      default:
        return 0;
    }
  }

  /**
   * Quick select a node
   */
  private quickSelectNode(index: number): void {
    if (this.clusterState && index < this.clusterState.nodes.length) {
      this.state.activePanel = TuiPanel.NODES;
      this.state.selectedNode = this.clusterState.nodes[index].name;
      this.state.scrollOffset = index;
      this.render();
    }
  }

  /**
   * Show migration panel
   */
  private showMigrationPanel(): void {
    if (!this.clusterState) return;

    const service = this.clusterState.services[this.state.scrollOffset];
    if (!service) return;

    this.migrationState = {
      visible: true,
      service,
      targetNodeIndex: 0,
      nodes: this.clusterState.nodes,
    };
    this.state.selectedService = service.name;
    this.render();
  }

  /**
   * Hide migration panel
   */
  private hideMigrationPanel(): void {
    this.migrationState.visible = false;
    this.render();
  }

  /**
   * Execute migration
   */
  private async executeMigration(): Promise<void> {
    if (!this.migrationState.service || !this.onMigrate) {
      this.hideMigrationPanel();
      return;
    }

    const targetNode = this.migrationState.nodes[this.migrationState.targetNodeIndex];
    if (!targetNode || targetNode.name === this.migrationState.service.node) {
      this.hideMigrationPanel();
      return;
    }

    const request: MigrationRequest = {
      service: this.migrationState.service.name,
      namespace: this.migrationState.service.namespace,
      sourceNode: this.migrationState.service.node,
      targetNode: targetNode.name,
      force: false,
    };

    this.hideMigrationPanel();

    try {
      await this.onMigrate(request);
    } catch (error) {
      // Error handling would show in the UI
    }
  }

  /**
   * Main render function
   */
  private render(): void {
    if (!this.running) return;

    const { columns = 80, rows = 24 } = process.stdout;
    const output: string[] = [];

    // Header
    output.push(this.renderHeader(columns));
    output.push('');

    if (this.state.showHelp) {
      output.push(...this.renderHelp());
    } else if (this.clusterState) {
      // Main content area
      output.push(...this.renderMainContent(columns, rows - 6));
    } else {
      output.push(chalk.gray('  Loading cluster data...'));
    }

    // Footer
    output.push('');
    output.push(this.renderFooter(columns));

    // Clear screen and render
    process.stdout.write('\x1B[H\x1B[J');
    process.stdout.write(output.join('\n'));
  }

  /**
   * Render header
   */
  private renderHeader(width: number): string {
    const title = chalk.bold.white(' selfhost monitor ');
    const controls = chalk.gray('[q]uit [r]efresh [h]elp');
    const padding = width - 20 - controls.length;

    return chalk.bgBlue(title + ' '.repeat(Math.max(0, padding)) + controls);
  }

  /**
   * Render footer
   */
  private renderFooter(width: number): string {
    if (!this.clusterState) {
      return chalk.gray('─'.repeat(width));
    }

    const timestamp = new Date(this.clusterState.timestamp).toLocaleTimeString();
    const status = chalk.gray(`Last update: ${timestamp}`);
    const activePanel = chalk.cyan(`[${this.state.activePanel}]`);

    return chalk.gray('─'.repeat(10)) + ' ' + activePanel + ' ' + status;
  }

  /**
   * Render main content
   */
  private renderMainContent(width: number, _height: number): string[] {
    const lines: string[] = [];

    if (!this.clusterState) {
      return [chalk.gray('  No data available')];
    }

    // Migration panel overlay
    if (this.migrationState.visible) {
      return renderMigrationPanel(this.migrationState, width);
    }

    // Layout: nodes (left) | summary (right top) | services (bottom)
    const leftWidth = Math.floor(width * 0.45);
    const rightWidth = width - leftWidth - 3;

    // Render panels
    const nodesLines = renderNodesPanel(
      this.clusterState.nodes,
      this.state.activePanel === TuiPanel.NODES ? this.state.scrollOffset : -1,
      leftWidth,
    );

    const summaryLines = renderSummaryPanel(this.clusterState.summary, rightWidth);

    const alertsLines = renderAlertsPanel(
      this.clusterState.alerts,
      this.state.activePanel === TuiPanel.ALERTS ? this.state.scrollOffset : -1,
      rightWidth,
    );

    // Combine left and right panels (side by side)
    const leftPanel = nodesLines;
    const rightPanel = [...summaryLines, '', ...alertsLines];

    const maxLeftLines = Math.max(leftPanel.length, rightPanel.length);

    for (let i = 0; i < maxLeftLines; i++) {
      const left = (leftPanel[i] || '').padEnd(leftWidth);
      const right = rightPanel[i] || '';
      lines.push(left + ' │ ' + right);
    }

    lines.push('─'.repeat(width));

    // Services panel at bottom
    const servicesLines = renderServicesPanel(
      this.clusterState.services,
      this.state.activePanel === TuiPanel.SERVICES ? this.state.scrollOffset : -1,
      width,
    );
    lines.push(...servicesLines);

    return lines;
  }

  /**
   * Render help panel
   */
  private renderHelp(): string[] {
    const lines: string[] = [];

    lines.push(chalk.bold.cyan(' KEYBOARD SHORTCUTS '));
    lines.push(chalk.gray('─'.repeat(40)));
    lines.push('');

    for (const [key, description] of Object.entries(KEYBOARD_SHORTCUTS)) {
      lines.push(`  ${chalk.bold(key.padEnd(12))} ${description}`);
    }

    lines.push('');
    lines.push(chalk.gray('  Press [h] to close this help'));

    return lines;
  }

  /**
   * Render headless (JSON) output
   */
  renderHeadless(): string {
    if (!this.clusterState) {
      return JSON.stringify({ error: 'No data available' });
    }
    return JSON.stringify(this.clusterState, null, 2);
  }
}
