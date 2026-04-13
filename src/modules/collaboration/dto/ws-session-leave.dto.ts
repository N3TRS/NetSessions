import { IsMongoId } from 'class-validator';

export class WsSessionLeaveDto {
  @IsMongoId()
  sessionId!: string;
}
