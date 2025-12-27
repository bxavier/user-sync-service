import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';
import { LoggerService } from '@/infrastructure/logger';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new LoggerService('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const response = ctx.getResponse<FastifyReply>();

    const { method, url, body, query, params } = request;
    const startTime = Date.now();

    this.logger.log('Request', {
      method,
      url,
      params: Object.keys(params || {}).length ? params : undefined,
      query: Object.keys(query || {}).length ? query : undefined,
      body: body && Object.keys(body).length ? body : undefined,
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          this.logger.log('Response', {
            method,
            url,
            statusCode: response.statusCode,
            duration: `${duration}ms`,
            body: data,
          });
        },
        error: () => {
          // Errors are logged by HttpExceptionFilter
        },
      }),
    );
  }
}
