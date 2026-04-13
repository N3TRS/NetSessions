import { Module } from '@nestjs/common';
import { AuthIntegrationModule } from '../auth-integration/auth-integration.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { RedisModule } from '../redis/redis.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [PersistenceModule, AuthIntegrationModule, RedisModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
