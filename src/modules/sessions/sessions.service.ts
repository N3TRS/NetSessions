import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Session } from '@prisma/client';
import * as Y from 'yjs';
import { SessionsRepository } from '../persistence/repositories/sessions.repository';
import { SessionParticipantsRepository } from '../persistence/repositories/session-participants.repository';
import { SessionSnapshotsRepository } from '../persistence/repositories/session-snapshots.repository';
import { YjsDocStateRepository } from '../persistence/repositories/yjs-doc-state.repository';
import { RedisService } from '../redis/redis.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { JoinSessionDto } from './dto/join-session.dto';
import { CreateSessionSnapshotDto } from './dto/create-session-snapshot.dto';
import { RenameSessionDto } from './dto/rename-session.dto';

const MAX_COLLABORATORS = 5;

@Injectable()
export class SessionsService {
  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly sessionParticipantsRepository: SessionParticipantsRepository,
    private readonly sessionSnapshotsRepository: SessionSnapshotsRepository,
    private readonly yjsDocStateRepository: YjsDocStateRepository,
    private readonly redisService: RedisService,
  ) {}

  async createSession(ownerEmail: string, dto: CreateSessionDto) {
    const name = dto.name.trim();
    await this.assertNameAvailableForOwner(ownerEmail, name);

    const inviteCode = await this.generateUniqueInviteCode();

    const session = await this.sessionsRepository.create({
      name,
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

  async listSessionsForUser(userEmail: string) {
    const sessions = await this.sessionsRepository.listForUser(userEmail);
    return { sessions };
  }

  async renameSession(
    sessionId: string,
    userEmail: string,
    dto: RenameSessionDto,
  ) {
    const session = await this.getSessionOrThrow(sessionId);
    this.assertOwner(session, userEmail);

    const name = dto.name.trim();

    if (name === session.name) {
      return { session };
    }

    await this.assertNameAvailableForOwner(userEmail, name, sessionId);
    const updated = await this.sessionsRepository.updateName(sessionId, name);

    return { session: updated };
  }

  async deleteSession(sessionId: string, userEmail: string) {
    const session = await this.getSessionOrThrow(sessionId);
    this.assertOwner(session, userEmail);

    const updated = await this.sessionsRepository.softDelete(sessionId);

    return { session: updated };
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

  async getSessionCode(sessionId: string): Promise<{ code: string }> {
    await this.getSessionOrThrow(sessionId);

    const stateBytes = await this.loadYjsState(sessionId);

    if (!stateBytes) {
      throw new NotFoundException('No code state available for this session');
    }

    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, stateBytes);
      return { code: doc.getText('content').toJSON() };
    } finally {
      doc.destroy();
    }
  }

  private async loadYjsState(sessionId: string): Promise<Uint8Array | null> {
    const redisState = await this.redisService.getYjsDocState(sessionId);
    if (redisState && redisState.byteLength > 0) {
      return redisState;
    }

    const mongoState =
      await this.yjsDocStateRepository.findBySessionId(sessionId);
    if (mongoState?.state && mongoState.state.length > 0) {
      return Uint8Array.from(mongoState.state);
    }

    return null;
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

  private assertOwner(session: Session, userEmail: string): void {
    if (session.ownerEmail !== userEmail) {
      throw new ForbiddenException(
        'Only the session owner can perform this action',
      );
    }
  }

  private async assertNameAvailableForOwner(
    ownerEmail: string,
    name: string,
    excludeSessionId?: string,
  ): Promise<void> {
    const existing = await this.sessionsRepository.findActiveByOwnerAndName(
      ownerEmail,
      name,
    );

    if (existing && existing.id !== excludeSessionId) {
      throw new ConflictException('You already have a session with this name');
    }
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
