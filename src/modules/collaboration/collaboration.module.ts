import { Module } from '@nestjs/common';
import { AuthIntegrationModule } from '../auth-integration/auth-integration.module';
import { RedisModule } from '../redis/redis.module';
import { SessionsModule } from '../sessions/sessions.module';
import { CollaborationGateway } from './collaboration.gateway';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@Module({
  imports: [AuthIntegrationModule, SessionsModule, RedisModule],
  providers: [CollaborationGateway, WsJwtGuard],
})
export class CollaborationModule {}
