import { Injectable } from '@nestjs/common';
import { Session } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface CreateSessionInput {
  name: string;
  inviteCode: string;
  ownerEmail: string;
  language: string;
}

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateSessionInput): Promise<Session> {
    return this.prisma.session.create({ data });
  }

  findById(id: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { id } });
  }

  findByInviteCode(inviteCode: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { inviteCode } });
  }
}
