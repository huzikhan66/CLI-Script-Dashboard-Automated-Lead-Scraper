/**
 * Helper to parse ANSI escape codes to styled HTML spans for browser terminal display
 */
export function ansiToHtml(text: string): string {
  if (!text) return '';

  // Handle 24-bit TrueColor \x1b[38;2;r;g;bm
  let html = text.replace(
    /\x1b\[38;2;(\d+);(\d+);(\d+)m/g,
    (_match, r, g, b) => `<span style="color: rgb(${r},${g},${b})">`
  );

  // Handle 24-bit TrueColor background \x1b[48;2;r;g;bm
  html = html.replace(
    /\x1b\[48;2;(\d+);(\d+);(\d+)m/g,
    (_match, r, g, b) => `<span style="background-color: rgb(${r},${g},${b})">`
  );

  // Standard ANSI foreground colors
  const ansiColorMap: Record<number, string> = {
    0: '</span>', // Reset
    1: '<span class="font-bold">',
    2: '<span class="opacity-70">',
    3: '<span class="italic">',
    4: '<span class="underline">',
    30: '<span class="text-neutral-500">',
    31: '<span class="text-rose-400">',
    32: '<span class="text-emerald-400">',
    33: '<span class="text-amber-300">',
    34: '<span class="text-blue-400">',
    35: '<span class="text-purple-400">',
    36: '<span class="text-cyan-400">',
    37: '<span class="text-neutral-200">',
    90: '<span class="text-neutral-600">',
    91: '<span class="text-rose-300">',
    92: '<span class="text-emerald-300">',
    93: '<span class="text-amber-200">',
    94: '<span class="text-blue-300">',
    95: '<span class="text-purple-300">',
    96: '<span class="text-cyan-300">',
    97: '<span class="text-white">',
  };

  html = html.replace(/\x1b\[(\d+)m/g, (_match, code) => {
    const num = parseInt(code, 10);
    return ansiColorMap[num] || '';
  });

  // Clean up any remaining unhandled escape codes
  html = html.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

  return html;
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
