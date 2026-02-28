import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesParser } from './services.parser';

@Module({
  providers: [ServicesService, ServicesParser],
  exports: [ServicesService, ServicesParser],
})
export class ServicesModule {}
