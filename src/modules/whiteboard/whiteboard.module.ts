import { Module } from '@nestjs/common';
import { AuthIntegrationModule } from '../auth-integration/auth-integration.module';
import { WhiteboardGateway } from './whiteboard.gateway';
import { WhiteboardJwtGuard } from './whiteboard-jwt.guard';

@Module({
  imports: [AuthIntegrationModule],
  providers: [WhiteboardGateway, WhiteboardJwtGuard],
})
export class WhiteboardModule {}
