import { RequestHandler } from 'msw';
import { yahooHandlers } from './yahoo-handlers';

// Combine all handlers
export const handlers: RequestHandler[] = [
  ...yahooHandlers,
];