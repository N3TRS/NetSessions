import { forwardRef, Module } from '@nestjs/common';
import { AuthIntegrationModule } from '../auth-integration/auth-integration.module';
import { CollaborationModule } from '../collaboration/collaboration.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { RedisModule } from '../redis/redis.module';
import { WhiteboardModule } from '../whiteboard/whiteboard.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    PersistenceModule,
    AuthIntegrationModule,
    RedisModule,
    forwardRef(() => CollaborationModule),
    WhiteboardModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
