import { Controller, Get, HttpCode, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { HealthResponseDto } from '@/application/dtos/health-response.dto';
import { HealthService } from '@/application/services/health.service';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({
    summary: 'Liveness check',
    description:
      'Checks if the application is alive. Used by load balancers and Kubernetes liveness probes. Rate limit: 30 req/min.',
  })
  @ApiOkResponse({
    description: 'Application is healthy or degraded',
    type: HealthResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Application has critical issues',
  })
  async check(): Promise<HealthResponseDto> {
    const health = await this.healthService.check();

    if (health.status === 'unhealthy') {
      throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }
}
