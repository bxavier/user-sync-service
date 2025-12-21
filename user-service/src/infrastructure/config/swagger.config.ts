import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('User Service API')
    .setDescription(
      'API for user management and legacy system synchronization',
    )
    .setVersion('1.0')
    .setContact('Bruno Xavier', 'https://brunoxavier.com.br', 'bruno@brunoxavier.com.br')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addTag('users', 'User management endpoints')
    .addTag('sync', 'Synchronization endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
