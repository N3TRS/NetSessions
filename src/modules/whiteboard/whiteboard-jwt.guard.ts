import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class WhiteboardJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token in whiteboard handshake');
    }

    try {
      const payload = await this.jwtService.verifyAsync<Record<string, unknown>>(token);
      client.data = { ...client.data, user: payload };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired whiteboard token');
    }
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth?.token;
    if (typeof auth === 'string' && auth.length > 0) return auth;

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    return null;
  }
}
