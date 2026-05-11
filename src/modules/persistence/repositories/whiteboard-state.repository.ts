import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WhiteboardStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(sessionId: string, elements: unknown[]): Promise<void> {
    await this.prisma.sessionWhiteboardState.upsert({
      where: { sessionId },
      update: { elements: JSON.stringify(elements) },
      create: { sessionId, elements: JSON.stringify(elements) },
    });
  }

  findBySessionId(sessionId: string) {
    return this.prisma.sessionWhiteboardState.findUnique({
      where: { sessionId },
    });
  }
}
