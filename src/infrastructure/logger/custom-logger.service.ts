import { ConsoleLogger, Injectable } from '@nestjs/common';

export interface LogMetadata {
  [key: string]: unknown;
}

@Injectable()
export class LoggerService extends ConsoleLogger {
  constructor(context: string = '') {
    super(context);
  }

  log(message: string, ...optionalParams: unknown[]) {
    const formatted = this.formatWithMethod(message, optionalParams);
    if (formatted.context) {
      super.log(formatted.message, formatted.context);
    } else {
      super.log(formatted.message);
    }
  }

  error(message: string, ...optionalParams: unknown[]) {
    const formatted = this.formatWithMethod(message, optionalParams);
    if (formatted.stack) {
      super.error(formatted.message, formatted.stack, formatted.context);
    } else if (formatted.context) {
      super.error(formatted.message, formatted.context);
    } else {
      super.error(formatted.message);
    }
  }

  warn(message: string, ...optionalParams: unknown[]) {
    const formatted = this.formatWithMethod(message, optionalParams);
    if (formatted.context) {
      super.warn(formatted.message, formatted.context);
    } else {
      super.warn(formatted.message);
    }
  }

  debug(message: string, ...optionalParams: unknown[]) {
    const formatted = this.formatWithMethod(message, optionalParams);
    if (formatted.context) {
      super.debug(formatted.message, formatted.context);
    } else {
      super.debug(formatted.message);
    }
  }

  verbose(message: string, ...optionalParams: unknown[]) {
    const formatted = this.formatWithMethod(message, optionalParams);
    if (formatted.context) {
      super.verbose(formatted.message, formatted.context);
    } else {
      super.verbose(formatted.message);
    }
  }

  private formatWithMethod(
    message: string,
    optionalParams: unknown[],
  ): { message: string; context?: string; stack?: string } {
    const parts: string[] = [];

    // Check if first param is metadata object (not a string context)
    if (
      optionalParams.length > 0 &&
      typeof optionalParams[0] === 'object' &&
      !Array.isArray(optionalParams[0])
    ) {
      const metadata = optionalParams[0] as LogMetadata;

      // Add method name from stack trace only for custom logs (with metadata)
      const methodName = this.getCallerMethodName();
      if (methodName) {
        parts.push(`[${methodName}]`);
      }

      parts.push(String(message));

      if (Object.keys(metadata).length > 0) {
        parts.push(JSON.stringify(metadata));
      }
      return {
        message: parts.join(' '),
        context: optionalParams[1] as string,
        stack: optionalParams[2] as string,
      };
    }

    // For NestJS internal logs (no metadata), don't try to capture method name
    parts.push(String(message));
    return {
      message: parts.join(' '),
      context: optionalParams[0] as string,
      stack: optionalParams[1] as string,
    };
  }

  private getCallerMethodName(): string {
    const stack = new Error().stack;
    if (!stack) return '';

    const stackLines = stack.split('\n');

    // Find the first line that's not from this logger class or NestJS internals
    for (let i = 0; i < stackLines.length; i++) {
      const line = stackLines[i];

      // Skip logger-related methods and NestJS internal wrappers
      if (line.includes('Logger')) {
        continue;
      }

      // Extract method name from stack trace
      // Format: "    at ClassName.methodName (/path/to/file.ts:line:column)"
      const match = line.match(/at\s+(?:(\w+)\.)?(\w+)\s+\(/);

      if (match) {
        // Return just the method name (not ClassName.methodName) since class is already in context
        const methodName = match[2];
        return methodName;
      }
    }

    return '';
  }
}
