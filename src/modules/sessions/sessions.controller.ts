import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth-integration/guards/jwt-auth.guard';
import { CreateSessionDto } from './dto/create-session.dto';
import { JoinSessionDto } from './dto/join-session.dto';
import { CreateSessionSnapshotDto } from './dto/create-session-snapshot.dto';
import { RenameSessionDto } from './dto/rename-session.dto';
import { SessionsService } from './sessions.service';
import { AuthUser } from './interfaces/auth-user.interface';

type AuthenticatedRequest = Request & { user?: AuthUser };

@ApiTags('sessions')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.' })
@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new session',
    description:
      'Creates a session owned by the authenticated user and returns it along with an invite code and online participant count.',
  })
  @ApiConflictResponse({
    description: 'Owner already has an active session with the same name.',
  })
  createSession(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionsService.createSession(this.getUserEmail(request), dto);
  }

  @Post('join')
  @ApiOperation({
    summary: 'Join a session by invite code',
    description:
      'Marks the authenticated user as an online participant of the session matching the invite code.',
  })
  @ApiNotFoundResponse({
    description: 'Invite code does not match an active session.',
  })
  @ApiConflictResponse({
    description: 'Session already has 5 online collaborators.',
  })
  joinSession(
    @Req() request: AuthenticatedRequest,
    @Body() dto: JoinSessionDto,
  ) {
    return this.sessionsService.joinSession(this.getUserEmail(request), dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List sessions owned by the authenticated user',
  })
  listMySessions(@Req() request: AuthenticatedRequest) {
    return this.sessionsService.listSessionsForUser(this.getUserEmail(request));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a session by id',
    description:
      'Returns the session, its participants and the cached presence/state snapshot.',
  })
  @ApiParam({ name: 'id', description: 'Session Mongo ObjectId.' })
  @ApiNotFoundResponse({ description: 'Session not found or soft-deleted.' })
  getSession(@Param('id') id: string) {
    return this.sessionsService.getSessionById(id);
  }

  @Get(':id/code')
  @ApiOperation({
    summary: 'Get the current code content of a session',
    description:
      'Returns the live Y.Text content (key `content`) of the collaborative document. Reads the Redis Yjs cache first and falls back to the persisted MongoDB Yjs state.',
  })
  @ApiParam({ name: 'id', description: 'Session Mongo ObjectId.' })
  @ApiOkResponse({
    description: 'Current session code.',
    schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          example: 'console.log("hello from the session");',
        },
      },
      required: ['code'],
    },
  })
  @ApiNotFoundResponse({
    description:
      'Session not found, soft-deleted, or the Yjs document has never been opened.',
  })
  getCode(@Param('id') id: string) {
    return this.sessionsService.getSessionCode(id);
  }

  @Patch(':id/rename')
  @ApiOperation({
    summary: 'Rename a session',
    description:
      'Only the owner can rename. Name must be unique among the owner’s active sessions.',
  })
  @ApiParam({ name: 'id', description: 'Session Mongo ObjectId.' })
  @ApiNotFoundResponse({ description: 'Session not found or soft-deleted.' })
  @ApiForbiddenResponse({ description: 'Caller is not the session owner.' })
  @ApiConflictResponse({
    description: 'Owner already has another session with that name.',
  })
  renameSession(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: RenameSessionDto,
  ) {
    return this.sessionsService.renameSession(
      id,
      this.getUserEmail(request),
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete a session',
    description:
      'Only the owner can delete. Sets `isActive` to false; data is not physically removed.',
  })
  @ApiParam({ name: 'id', description: 'Session Mongo ObjectId.' })
  @ApiNotFoundResponse({
    description: 'Session not found or already soft-deleted.',
  })
  @ApiForbiddenResponse({ description: 'Caller is not the session owner.' })
  deleteSession(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.sessionsService.deleteSession(id, this.getUserEmail(request));
  }

  @Post(':id/snapshots')
  @ApiOperation({
    summary: 'Save a code snapshot',
    description:
      'Creates a versioned snapshot of the current code attributed to the authenticated user.',
  })
  @ApiParam({ name: 'id', description: 'Session Mongo ObjectId.' })
  @ApiNotFoundResponse({ description: 'Session not found or soft-deleted.' })
  createSnapshot(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateSessionSnapshotDto,
  ) {
    return this.sessionsService.createSnapshot(
      id,
      this.getUserEmail(request),
      dto,
    );
  }

  private getUserEmail(request: AuthenticatedRequest): string {
    const email = request.user?.email;

    if (!email) {
      throw new UnauthorizedException('Authenticated user email is required');
    }

    return email;
  }
}
