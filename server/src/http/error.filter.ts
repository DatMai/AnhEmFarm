import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      response.status(status).json({ status: 'unavailable' });
      return;
    }
    const payload = error instanceof HttpException ? error.getResponse() : null;
    const code = typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string'
      ? payload.code : status === 503 ? 'UNAVAILABLE' : status === 422 ? 'VALIDATION_FAILED' : 'REQUEST_FAILED';
    const fields = typeof payload === 'object' && payload !== null && 'fields' in payload ? payload.fields : undefined;
    response.status(status).json({ code, ...(fields ? { fields } : {}) });
  }
}
