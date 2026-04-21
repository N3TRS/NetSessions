import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth-integration/guards/jwt-auth.guard';
import { ExecuteCodeDto } from './dto/execute-code.dto';
import { ExecutionService } from './execution.service';

type AuthenticatedRequest = Request & { user?: { email?: string } };

@Controller('executions')
@UseGuards(JwtAuthGuard)
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post('run')
  runCode(@Req() request: AuthenticatedRequest, @Body() dto: ExecuteCodeDto) {
    const email = request.user?.email;

    if (!email) {
      throw new UnauthorizedException('Authenticated user email is required');
    }

    return this.executionService.runCode(email, dto);
  }
}
