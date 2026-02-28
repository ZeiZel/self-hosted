import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createCli } from './cli';
import { Logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  const logger = new Logger();

  try {
    // Check for Bun runtime
    if (typeof Bun === 'undefined') {
      logger.error('This CLI requires Bun runtime. Please install Bun: https://bun.sh');
      // eslint-disable-next-line no-undef
      process.exit(1);
    }

    // Create NestJS application context (standalone mode)
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });

    // Create and run CLI
    const cli = createCli(app);
    // eslint-disable-next-line no-undef
    await cli.parseAsync(process.argv);

    // Clean up
    await app.close();
  } catch (error) {
    logger.error('Fatal error:', error instanceof Error ? error.message : String(error));
    // eslint-disable-next-line no-undef
    process.exit(1);
  }
}

bootstrap();
