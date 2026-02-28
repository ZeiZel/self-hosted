import { Module } from '@nestjs/common';
import { HostService } from './host.service';

@Module({
  providers: [HostService],
  exports: [HostService],
})
export class HostModule {}
