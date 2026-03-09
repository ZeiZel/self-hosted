import { Module, Global } from '@nestjs/common';
import { LoggerService } from './logger/logger.service';
import { ErrorHandlerService } from './errors/error-handler.service';

/**
 * Shared module providing common utilities across the application
 */
@Global()
@Module({
  providers: [LoggerService, ErrorHandlerService],
  exports: [LoggerService, ErrorHandlerService],
})
export class SharedModule {}
