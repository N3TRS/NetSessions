import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Session } from '@prisma/client';
import { SessionsRepository } from '../persistence/repositories/sessions.repository';
import { SessionParticipantsRepository } from '../persistence/repositories/session-participants.repository';
import { SessionSnapshotsRepository } from '../persistence/repositories/session-snapshots.repository';
import { RedisService } from '../redis/redis.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { JoinSessionDto } from './dto/join-session.dto';
import { CreateSessionSnapshotDto } from './dto/create-session-snapshot.dto';

const MAX_COLLABORATORS = 5;

@Injectable()
export class SessionsService {
  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly sessionParticipantsRepository: SessionParticipantsRepository,
    private readonly sessionSnapshotsRepository: SessionSnapshotsRepository,
    private readonly redisService: RedisService,
  ) {}

  async createSession(ownerEmail: string, dto: CreateSessionDto) {
    const inviteCode = await this.generateUniqueInviteCode();

    const session = await this.sessionsRepository.create({
      name: dto.name.trim(),
      inviteCode,
      ownerEmail,
      language: dto.language ?? 'javascript',
    });

    await this.sessionParticipantsRepository.upsertOnlineParticipant(
      session.id,
      ownerEmail,
    );

    await this.redisService.addSessionMember(session.id, ownerEmail);
    await this.redisService.setSessionState(session.id, {
      language: session.language,
      ownerEmail: session.ownerEmail,
      lastActivityAt: new Date().toISOString(),
    });

    return {
      session,
      participantsOnline: 1,
      canJoin: true,
    };
  }

  async joinSession(userEmail: string, dto: JoinSessionDto) {
    const session = await this.sessionsRepository.findByInviteCode(
      dto.inviteCode.toUpperCase(),
    );

    if (!session || !session.isActive) {
      throw new NotFoundException('Session not found');
    }

    await this.markParticipantOnline(session.id, userEmail);

    await this.redisService.addSessionMember(session.id, userEmail);
    await this.redisService.refreshSessionStateTtl(session.id);

    const participantsOnline = await this.redisService.getSessionMembersCount(
      session.id,
    );

    return {
      session,
      participantsOnline,
      canJoin: true,
    };
  }

  async joinSessionById(sessionId: string, userEmail: string) {
    const session = await this.getSessionOrThrow(sessionId);

    await this.markParticipantOnline(session.id, userEmail);
    await this.redisService.addSessionMember(session.id, userEmail);
    await this.redisService.refreshSessionStateTtl(session.id);

    const participantsOnline = await this.redisService.getSessionMembersCount(
      session.id,
    );

    return {
      session,
      participantsOnline,
      canJoin: true,
    };
  }

  async getSessionById(sessionId: string) {
    const session = await this.getSessionOrThrow(sessionId);
    const participants =
      await this.sessionParticipantsRepository.listBySessionId(sessionId);

    const redisState = await this.redisService.getSessionState(sessionId);
    const redisMembers = await this.redisService.getSessionMembers(sessionId);

    if (redisMembers.length === 0) {
      await this.redisService.setSessionState(sessionId, {
        language: session.language,
        ownerEmail: session.ownerEmail,
        lastActivityAt: new Date().toISOString(),
      });
    }

    return {
      session,
      participants,
      participantsOnline:
        redisMembers.length > 0
          ? redisMembers.length
          : participants.filter((participant) => participant.isOnline).length,
      state: redisState,
    };
  }

  async createSnapshot(
    sessionId: string,
    savedByEmail: string,
    dto: CreateSessionSnapshotDto,
  ) {
    await this.getSessionOrThrow(sessionId);

    const snapshot = await this.sessionSnapshotsRepository.create({
      sessionId,
      savedByEmail,
      language: dto.language,
      code: dto.code,
    });

    await this.redisService.setSessionState(sessionId, {
      language: dto.language,
      lastSavedByEmail: savedByEmail,
      lastSavedAt: snapshot.createdAt.toISOString(),
      lastActivityAt: new Date().toISOString(),
    });

    return { snapshot };
  }

  async markParticipantOffline(
    sessionId: string,
    userEmail: string,
  ): Promise<void> {
    await this.getSessionOrThrow(sessionId);

    await this.sessionParticipantsRepository.setOffline(sessionId, userEmail);
    await this.redisService.removeSessionMember(sessionId, userEmail);
    await this.redisService.refreshSessionStateTtl(sessionId);
  }

  async acquireRunLock(sessionId: string, owner: string): Promise<boolean> {
    await this.getSessionOrThrow(sessionId);
    return this.redisService.acquireExecutionLock(sessionId, owner);
  }

  async releaseRunLock(sessionId: string, owner: string): Promise<void> {
    await this.redisService.releaseExecutionLock(sessionId, owner);
  }

  private async getSessionOrThrow(sessionId: string): Promise<Session> {
    const session = await this.sessionsRepository.findById(sessionId);

    if (!session || !session.isActive) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  private async generateUniqueInviteCode(maxAttempts = 5): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const inviteCode = randomBytes(4).toString('hex').toUpperCase();
      const existing =
        await this.sessionsRepository.findByInviteCode(inviteCode);

      if (!existing) {
        return inviteCode;
      }
    }

    throw new ConflictException('Could not generate unique invite code');
  }

  private async markParticipantOnline(
    sessionId: string,
    userEmail: string,
  ): Promise<void> {
    const existing =
      await this.sessionParticipantsRepository.findBySessionIdAndUserEmail(
        sessionId,
        userEmail,
      );

    if (!existing || !existing.isOnline) {
      const onlineCount =
        await this.sessionParticipantsRepository.countOnlineBySessionId(
          sessionId,
        );

      if (onlineCount >= MAX_COLLABORATORS) {
        throw new ConflictException('Session is full (max 5 collaborators)');
      }
    }

    await this.sessionParticipantsRepository.upsertOnlineParticipant(
      sessionId,
      userEmail,
    );
  }
}
