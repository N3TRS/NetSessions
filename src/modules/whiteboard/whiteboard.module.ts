import { Module } from '@nestjs/common';
import { AuthIntegrationModule } from '../auth-integration/auth-integration.module';
import { RedisModule } from '../redis/redis.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { WhiteboardGateway } from './whiteboard.gateway';
import { WhiteboardJwtGuard } from './whiteboard-jwt.guard';

@Module({
  imports: [AuthIntegrationModule, RedisModule, PersistenceModule],
  providers: [WhiteboardGateway, WhiteboardJwtGuard],
  exports: [WhiteboardGateway],
})
export class WhiteboardModule {}
