import { Module } from '@nestjs/common';
import { NodeService } from './node.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [ConfigModule],
  providers: [NodeService],
  exports: [NodeService],
})
export class NodeModule {}
