import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import {
  EXECUTION_LOCK_TTL_MS,
  REDIS_PUBLISHER_CLIENT,
  REDIS_SUBSCRIBER_CLIENT,
  SESSION_MEMBERS_TTL_SECONDS,
  SESSION_STATE_TTL_SECONDS,
} from './redis.constants';
import {
  sessionEventsChannel,
  sessionExecutionLockKey,
  sessionMembersKey,
  sessionStateKey,
} from './redis.utils';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly channelHandlers = new Map<
    string,
    (event: unknown) => void
  >();

  constructor(
    @Inject(REDIS_PUBLISHER_CLIENT)
    private readonly publisher: Redis,
    @Inject(REDIS_SUBSCRIBER_CLIENT)
    private readonly subscriber: Redis,
  ) {
    this.subscriber.on('message', this.handleMessage.bind(this));
  }

  async addSessionMember(
    sessionId: string,
    userEmail: string,
  ): Promise<number> {
    const key = sessionMembersKey(sessionId);
    const total = await this.publisher.sadd(key, userEmail);
    await this.publisher.expire(key, SESSION_MEMBERS_TTL_SECONDS);
    return total;
  }

  async removeSessionMember(
    sessionId: string,
    userEmail: string,
  ): Promise<number> {
    const key = sessionMembersKey(sessionId);
    const removed = await this.publisher.srem(key, userEmail);
    await this.publisher.expire(key, SESSION_MEMBERS_TTL_SECONDS);
    return removed;
  }

  getSessionMembers(sessionId: string): Promise<string[]> {
    return this.publisher.smembers(sessionMembersKey(sessionId));
  }

  async getSessionMembersCount(sessionId: string): Promise<number> {
    return this.publisher.scard(sessionMembersKey(sessionId));
  }

  async refreshSessionPresence(sessionId: string): Promise<void> {
    await this.publisher.expire(
      sessionMembersKey(sessionId),
      SESSION_MEMBERS_TTL_SECONDS,
    );
  }

  async setSessionState(
    sessionId: string,
    values: Record<string, string>,
  ): Promise<void> {
    const key = sessionStateKey(sessionId);
    await this.publisher.hset(key, values);
    await this.publisher.expire(key, SESSION_STATE_TTL_SECONDS);
  }

  getSessionState(sessionId: string): Promise<Record<string, string>> {
    return this.publisher.hgetall(sessionStateKey(sessionId));
  }

  async refreshSessionStateTtl(sessionId: string): Promise<void> {
    await this.publisher.expire(
      sessionStateKey(sessionId),
      SESSION_STATE_TTL_SECONDS,
    );
  }

  async acquireExecutionLock(
    sessionId: string,
    owner: string,
  ): Promise<boolean> {
    const result = await this.publisher.set(
      sessionExecutionLockKey(sessionId),
      owner,
      'PX',
      EXECUTION_LOCK_TTL_MS,
      'NX',
    );
    return result === 'OK';
  }

  async releaseExecutionLock(sessionId: string, owner: string): Promise<void> {
    const key = sessionExecutionLockKey(sessionId);
    const lockOwner = await this.publisher.get(key);

    if (lockOwner === owner) {
      await this.publisher.del(key);
    }
  }

  publishSessionEvent(sessionId: string, event: unknown): Promise<number> {
    return this.publisher.publish(
      sessionEventsChannel(sessionId),
      JSON.stringify(event),
    );
  }

  async subscribeToSessionEvents(
    sessionId: string,
    onMessage: (event: unknown) => void,
  ): Promise<void> {
    const channel = sessionEventsChannel(sessionId);
    this.channelHandlers.set(channel, onMessage);
    await this.subscriber.subscribe(channel);
  }

  async unsubscribeFromSessionEvents(sessionId: string): Promise<number> {
    const channel = sessionEventsChannel(sessionId);
    this.channelHandlers.delete(channel);
    const result = await this.subscriber.unsubscribe(channel);
    return typeof result === 'number' ? result : 0;
  }

  private handleMessage(channel: string, payload: string): void {
    const handler = this.channelHandlers.get(channel);

    if (!handler) {
      return;
    }

    try {
      handler(JSON.parse(payload));
    } catch (error) {
      this.logger.warn(
        `Invalid session event payload for ${channel}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.channelHandlers.clear();

    await Promise.allSettled([this.subscriber.quit(), this.publisher.quit()]);
  }
}
