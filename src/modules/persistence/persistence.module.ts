import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SessionsRepository } from './repositories/sessions.repository';
import { SessionParticipantsRepository } from './repositories/session-participants.repository';
import { SessionSnapshotsRepository } from './repositories/session-snapshots.repository';

@Module({
  providers: [
    PrismaService,
    SessionsRepository,
    SessionParticipantsRepository,
    SessionSnapshotsRepository,
  ],
  exports: [
    PrismaService,
    SessionsRepository,
    SessionParticipantsRepository,
    SessionSnapshotsRepository,
  ],
})
export class PersistenceModule {}
