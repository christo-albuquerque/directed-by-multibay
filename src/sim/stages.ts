export const STAGES = ['depot', 'lint', 'build', 'test', 'dispatch'] as const;
export type StageName = (typeof STAGES)[number];

/** Path position at which a product reaches the launchpad. */
export const LAUNCHPAD_U = STAGES.length;
