/** What the sky is showing. */
export type WeatherKind = 'drizzle' | 'rain' | 'storm' | 'snow' | 'overcast';
/** What the Demo Panel picks: Dynamic follows its own random schedule, the rest hold one state. */
export type WeatherMode = 'dynamic' | 'clear' | 'rain' | 'snow' | 'overcast' | 'off';
export const WEATHER_MODES: WeatherMode[] = ['dynamic', 'clear', 'rain', 'snow', 'overcast', 'off'];
