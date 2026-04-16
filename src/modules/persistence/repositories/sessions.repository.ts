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

  listForUser(userEmail: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: {
        isActive: true,
        OR: [
          { ownerEmail: userEmail },
          { participants: { some: { userEmail } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findActiveByOwnerAndName(
    ownerEmail: string,
    name: string,
  ): Promise<Session | null> {
    return this.prisma.session.findFirst({
      where: { ownerEmail, name, isActive: true },
    });
  }

  updateName(id: string, name: string): Promise<Session> {
    return this.prisma.session.update({ where: { id }, data: { name } });
  }

  softDelete(id: string): Promise<Session> {
    return this.prisma.session.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
