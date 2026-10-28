import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApplicationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApplicationExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException && error.getStatus() !== 500) {
      const body = error.getResponse();
      const details = typeof body === 'string' ? { message: body } : body;
      response.status(error.getStatus()).json({
        statusCode: error.getStatus(),
        code: 'REQUEST_FAILED',
        ...details,
      });
      return;
    }
    // Error contents can contain SQL, credentials, or request data.
    this.logger.error('Unexpected application request failure');
    response.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Unable to complete the request. Please try again.',
    });
  }
}
