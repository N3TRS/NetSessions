import { Injectable } from '@nestjs/common';
import { SessionSnapshot } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface CreateSessionSnapshotInput {
  sessionId: string;
  savedByEmail: string;
  language: string;
  code: string;
}

@Injectable()
export class SessionSnapshotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateSessionSnapshotInput): Promise<SessionSnapshot> {
    return this.prisma.sessionSnapshot.create({ data });
  }

  listBySessionId(sessionId: string): Promise<SessionSnapshot[]> {
    return this.prisma.sessionSnapshot.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
