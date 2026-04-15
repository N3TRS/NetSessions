import { IsMongoId } from 'class-validator';

export class WsSessionDto {
  @IsMongoId()
  sessionId!: string;
}
