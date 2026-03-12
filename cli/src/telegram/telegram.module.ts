import { Module, forwardRef } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramConfigService } from './telegram-config.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramAlertService } from './telegram-alert.service';
import { DatabaseModule } from '../database/database.module';
import { MonitorModule } from '../modules/monitor/monitor.module';
import { DaemonModule } from '../daemon/daemon.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => MonitorModule),
    forwardRef(() => DaemonModule),
  ],
  providers: [
    TelegramService,
    TelegramConfigService,
    TelegramBotService,
    TelegramAlertService,
  ],
  exports: [
    TelegramService,
    TelegramConfigService,
    TelegramBotService,
    TelegramAlertService,
  ],
})
export class TelegramModule {}
