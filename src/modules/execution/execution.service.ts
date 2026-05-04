import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ExecuteCodeDto } from './dto/execute-code.dto';
import { PistonService } from './piston.service';
import { SessionsService } from '../sessions/sessions.service';
import { RedisService } from '../redis/redis.service';
import { CollaborationGateway } from '../collaboration/collaboration.gateway';
import { canExecute } from '../sessions/permissions';

@Injectable()
export class ExecutionService {
  constructor(
    private readonly pistonService: PistonService,
    private readonly sessionsService: SessionsService,
    private readonly redisService: RedisService,
    private readonly collaborationGateway: CollaborationGateway,
  ) {}

  async runCode(userEmail: string, dto: ExecuteCodeDto) {
    const lockOwner = `${userEmail}:${Date.now()}`;
    const locked = await this.sessionsService.acquireRunLock(
      dto.sessionId,
      lockOwner,
    );

    if (!locked) {
      throw new ConflictException(
        'Another execution is in progress for this session',
      );
    }

    try {
      const sessionData = await this.sessionsService.getSessionById(
        dto.sessionId,
      );
      const participant = sessionData.participants.find(
        (p) => p.userEmail === userEmail,
      );

      if (!participant) {
        throw new UnauthorizedException('User is not a member of this session');
      }

      if (
        !canExecute(
          participant.role,
          sessionData.session.ownerEmail,
          userEmail,
        )
      ) {
        throw new ForbiddenException(
          'You do not have permission to execute code in this session',
        );
      }

      const result = await this.pistonService.execute({
        language: dto.language,
        code: dto.code,
        stdin: dto.stdin,
        args: dto.args,
      });

      await this.redisService.setSessionState(dto.sessionId, {
        language: dto.language,
        lastRunByEmail: userEmail,
        lastRunAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      });

      const payload = {
        sessionId: dto.sessionId,
        runBy: userEmail,
        ...result,
      };

      this.collaborationGateway.emitExecutionResult(dto.sessionId, payload);

      return payload;
    } finally {
      await this.sessionsService.releaseRunLock(dto.sessionId, lockOwner);
    }
  }
}
