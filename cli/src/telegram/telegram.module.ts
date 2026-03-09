import { Module, forwardRef } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramConfigService } from './telegram-config.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramAlertService } from './telegram-alert.service';
import { DatabaseModule } from '../database/database.module';
import { MonitorModule } from '../modules/monitor/monitor.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => MonitorModule),
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
