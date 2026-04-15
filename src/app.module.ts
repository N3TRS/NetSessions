import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { AuthIntegrationModule } from './modules/auth-integration/auth-integration.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { CollaborationModule } from './modules/collaboration/collaboration.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { RedisModule } from './modules/redis/redis.module';
import { PersistenceModule } from './modules/persistence/persistence.module';
import { YjsModule } from './modules/yjs/yjs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
    }),
    HealthModule,
    AuthIntegrationModule,
    SessionsModule,
    CollaborationModule,
    ExecutionModule,
    RedisModule,
    PersistenceModule,
    YjsModule,
  ],
})
export class AppModule {}
