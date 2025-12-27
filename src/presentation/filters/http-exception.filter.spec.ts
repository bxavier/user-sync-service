/**
 * Unit Tests - HttpExceptionFilter
 *
 * Tests the global exception filter that:
 * - Transforms different exception types to HTTP responses
 * - Logs errors appropriately (error for 5xx, warn for 4xx)
 * - Formats consistent error response structure
 */

import { ArgumentsHost, HttpException, HttpStatus, NotFoundException, BadRequestException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: {
    status: jest.Mock;
    send: jest.Mock;
  };
  let mockRequest: {
    url: string;
  };
  let mockHost: ArgumentsHost;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    mockRequest = {
      url: '/test/path',
    };

    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;

    // Mock logger methods to silence output during tests
    loggerErrorSpy = jest
      .spyOn(
        (filter as unknown as { logger: { error: jest.Mock; warn: jest.Mock } }).logger,
        'error',
      )
      .mockImplementation(() => {});
    loggerWarnSpy = jest
      .spyOn(
        (filter as unknown as { logger: { error: jest.Mock; warn: jest.Mock } }).logger,
        'warn',
      )
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HttpException handling', () => {
    it('should handle NotFoundException', () => {
      const exception = new NotFoundException('User not found');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          message: 'User not found',
          error: 'Not Found', // NestJS NotFoundException returns { error: "Not Found" }
        }),
      );
    });

    it('should handle BadRequestException', () => {
      const exception = new BadRequestException('Invalid input');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Invalid input',
        }),
      );
    });

    it('should handle BadRequestException with validation errors (array)', () => {
      const exception = new BadRequestException({
        message: ['email must be valid', 'name is required'],
        error: 'Bad Request',
      });

      filter.catch(exception, mockHost);

      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: ['email must be valid', 'name is required'],
        }),
      );
    });

    it('should handle HttpException with string response', () => {
      const exception = new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: 'Forbidden resource',
          error: 'Forbidden', // Uses standard HTTP error name for string responses
        }),
      );
    });

    it('should handle HttpException with object response', () => {
      const exception = new HttpException(
        { message: 'Custom error', error: 'CustomError' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 422,
          message: 'Custom error',
          error: 'CustomError',
        }),
      );
    });
  });

  describe('Non-HttpException handling', () => {
    it('should handle generic Error', () => {
      const exception = new Error('Something went wrong');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Something went wrong',
          error: 'Error',
        }),
      );
    });

    it('should handle TypeError', () => {
      const exception = new TypeError('Cannot read property of undefined');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          error: 'TypeError',
        }),
      );
    });

    it('should handle unknown exception type', () => {
      const exception = 'Just a string error';

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Internal server error',
          error: 'Internal Server Error',
        }),
      );
    });

    it('should handle null exception', () => {
      filter.catch(null, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('response structure', () => {
    it('should include timestamp in response', () => {
      const exception = new NotFoundException('Not found');

      filter.catch(exception, mockHost);

      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        }),
      );

      // Verify timestamp is ISO format
      const response = mockResponse.send.mock.calls[0][0];
      expect(() => new Date(response.timestamp)).not.toThrow();
    });

    it('should include request path in response', () => {
      mockRequest.url = '/api/users/123';
      const exception = new NotFoundException('User not found');

      filter.catch(exception, mockHost);

      expect(mockResponse.send).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/users/123',
        }),
      );
    });
  });

  describe('logging', () => {
    it('should log error for 5xx status codes', () => {
      const exception = new Error('Internal error');

      filter.catch(exception, mockHost);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Internal error',
        expect.objectContaining({
          error: expect.any(Object),
          stack: expect.any(String),
        }),
      );
    });

    it('should log warn for 4xx status codes', () => {
      const exception = new NotFoundException('Not found');

      filter.catch(exception, mockHost);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Request error',
        expect.objectContaining({
          error: expect.any(Object),
        }),
      );
    });

    it('should not log error for 4xx', () => {
      const exception = new BadRequestException('Bad request');

      filter.catch(exception, mockHost);

      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should include stack trace in error log for 5xx', () => {
      const exception = new Error('Server error');

      filter.catch(exception, mockHost);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Internal error',
        expect.objectContaining({
          stack: expect.stringContaining('Error'),
        }),
      );
    });
  });
});
