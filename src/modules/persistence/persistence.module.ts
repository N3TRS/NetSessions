import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SessionsRepository } from './repositories/sessions.repository';
import { SessionParticipantsRepository } from './repositories/session-participants.repository';
import { SessionSnapshotsRepository } from './repositories/session-snapshots.repository';
import { YjsDocStateRepository } from './repositories/yjs-doc-state.repository';
import { WhiteboardStateRepository } from './repositories/whiteboard-state.repository';

@Module({
  providers: [
    PrismaService,
    SessionsRepository,
    SessionParticipantsRepository,
    SessionSnapshotsRepository,
    YjsDocStateRepository,
    WhiteboardStateRepository,
  ],
  exports: [
    PrismaService,
    SessionsRepository,
    SessionParticipantsRepository,
    SessionSnapshotsRepository,
    YjsDocStateRepository,
    WhiteboardStateRepository,
  ],
})
export class PersistenceModule {}
