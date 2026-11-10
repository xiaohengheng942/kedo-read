/**
 * Build-time product policy for the standalone personal edition.
 *
 * This flag only changes client-side product presentation and gates for
 * device-local features. It never grants access to Readest-hosted services.
 */
export const PERSONAL_EDITION = process.env['NEXT_PUBLIC_READEST_PERSONAL_EDITION'] === 'true';
