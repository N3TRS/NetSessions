import { Module } from '@nestjs/common';
import { AuthIntegrationModule } from '../auth-integration/auth-integration.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { RedisModule } from '../redis/redis.module';
import { YjsService } from './yjs.service';

@Module({
  imports: [AuthIntegrationModule, PersistenceModule, RedisModule],
  providers: [YjsService],
  exports: [YjsService],
})
export class YjsModule {}
