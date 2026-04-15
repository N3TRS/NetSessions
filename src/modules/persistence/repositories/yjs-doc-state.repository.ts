import { Injectable } from '@nestjs/common';
import { SessionYjsState } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class YjsDocStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(sessionId: string, state: Uint8Array): Promise<void> {
    const bytes = new Uint8Array(state.byteLength);
    bytes.set(state);

    await this.prisma.sessionYjsState.upsert({
      where: { sessionId },
      update: { state: bytes },
      create: { sessionId, state: bytes },
    });
  }

  findBySessionId(sessionId: string): Promise<SessionYjsState | null> {
    return this.prisma.sessionYjsState.findUnique({ where: { sessionId } });
  }
}
