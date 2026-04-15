import { Injectable } from '@nestjs/common';
import { SessionParticipant } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SessionParticipantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertOnlineParticipant(
    sessionId: string,
    userEmail: string,
  ): Promise<SessionParticipant> {
    const existing = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userEmail: {
          sessionId,
          userEmail,
        },
      },
    });

    if (existing) {
      return this.prisma.sessionParticipant.update({
        where: { id: existing.id },
        data: {
          isOnline: true,
          leftAt: null,
        },
      });
    }

    return this.prisma.sessionParticipant.create({
      data: {
        sessionId,
        userEmail,
        isOnline: true,
      },
    });
  }

  setOffline(
    sessionId: string,
    userEmail: string,
  ): Promise<SessionParticipant> {
    return this.prisma.sessionParticipant.update({
      where: {
        sessionId_userEmail: {
          sessionId,
          userEmail,
        },
      },
      data: {
        isOnline: false,
        leftAt: new Date(),
      },
    });
  }

  countOnlineBySessionId(sessionId: string): Promise<number> {
    return this.prisma.sessionParticipant.count({
      where: {
        sessionId,
        isOnline: true,
      },
    });
  }

  findBySessionIdAndUserEmail(
    sessionId: string,
    userEmail: string,
  ): Promise<SessionParticipant | null> {
    return this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userEmail: {
          sessionId,
          userEmail,
        },
      },
    });
  }

  listBySessionId(sessionId: string): Promise<SessionParticipant[]> {
    return this.prisma.sessionParticipant.findMany({
      where: { sessionId },
      orderBy: { joinedAt: 'asc' },
    });
  }
}
