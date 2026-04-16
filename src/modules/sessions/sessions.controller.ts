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
import { Request } from 'express';
import { JwtAuthGuard } from '../auth-integration/guards/jwt-auth.guard';
import { CreateSessionDto } from './dto/create-session.dto';
import { JoinSessionDto } from './dto/join-session.dto';
import { CreateSessionSnapshotDto } from './dto/create-session-snapshot.dto';
import { RenameSessionDto } from './dto/rename-session.dto';
import { SessionsService } from './sessions.service';
import { AuthUser } from './interfaces/auth-user.interface';

type AuthenticatedRequest = Request & { user?: AuthUser };

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  createSession(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionsService.createSession(this.getUserEmail(request), dto);
  }

  @Post('join')
  joinSession(
    @Req() request: AuthenticatedRequest,
    @Body() dto: JoinSessionDto,
  ) {
    return this.sessionsService.joinSession(this.getUserEmail(request), dto);
  }

  @Get()
  listMySessions(@Req() request: AuthenticatedRequest) {
    return this.sessionsService.listSessionsForUser(this.getUserEmail(request));
  }

  @Get(':id')
  getSession(@Param('id') id: string) {
    return this.sessionsService.getSessionById(id);
  }

  @Patch(':id/rename')
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
  deleteSession(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.sessionsService.deleteSession(id, this.getUserEmail(request));
  }

  @Post(':id/snapshots')
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
