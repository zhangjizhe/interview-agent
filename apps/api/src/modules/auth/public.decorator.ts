import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks an endpoint as intentionally reachable without a user session.
 * Keep this list small: health checks, authentication bootstrap, and telemetry.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
