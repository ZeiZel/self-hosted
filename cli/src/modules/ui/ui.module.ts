import { Module } from '@nestjs/common';
import { PromptsService } from './prompts.service';
import { TableService } from './table.service';

@Module({
  providers: [PromptsService, TableService],
  exports: [PromptsService, TableService],
})
export class UiModule {}
