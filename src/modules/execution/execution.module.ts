import { Module } from '@nestjs/common';
import { AuthIntegrationModule } from '../auth-integration/auth-integration.module';
import { SessionsModule } from '../sessions/sessions.module';
import { RedisModule } from '../redis/redis.module';
import { CollaborationModule } from '../collaboration/collaboration.module';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { PistonService } from './piston.service';

@Module({
  imports: [
    AuthIntegrationModule,
    SessionsModule,
    RedisModule,
    CollaborationModule,
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService, PistonService],
})
export class ExecutionModule {}
