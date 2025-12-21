import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { HealthService } from '../../application/services/health.service';
import {
  HealthResponseDto,
  HealthDetailsResponseDto,
} from '../../application/dtos/health-response.dto';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness check',
    description:
      'Verifica se a aplicação está viva. Usado por load balancers e Kubernetes liveness probes.',
  })
  @ApiOkResponse({
    description: 'Aplicação está saudável ou degradada',
    type: HealthResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Aplicação está com problemas críticos',
  })
  async check(): Promise<HealthResponseDto> {
    const health = await this.healthService.check();

    if (health.status === 'unhealthy') {
      throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }

  @Get('details')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Readiness check with details',
    description:
      'Verifica o estado detalhado da aplicação e seus componentes. Usado para observabilidade (Datadog, Zabbix, etc.). Rate limit: 10 req/min.',
  })
  @ApiOkResponse({
    description: 'Detalhes do estado da aplicação',
    type: HealthDetailsResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: 'Algum componente crítico está indisponível',
  })
  async checkDetails(): Promise<HealthDetailsResponseDto> {
    const health = await this.healthService.checkDetails();

    if (health.status === 'unhealthy') {
      throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }
}
