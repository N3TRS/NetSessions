import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { WsUser } from '../interfaces/ws-user.interface';

type SocketWithUser = Socket & { data: { user?: WsUser } };

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<SocketWithUser>();
    const token = this.extractToken(client);

    if (!token) {
      throw new UnauthorizedException(
        'Missing bearer token in websocket handshake',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<WsUser>(token);
      client.data.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired websocket token');
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;

    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const header = client.handshake.headers.authorization;

    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    return null;
  }
}
