const VALUE_FLAGS = ['--base', '--head', '--config', '--output'];

export function usage() {
  return `Usage: visual-pr-review --base <ref> [--head <ref>] [options]

Options:
  --base <ref>       Base git revision, required
  --head <ref>       Head git revision, default: HEAD
  --config <path>    Config path, default: visual-review.json
  --output <path>    Artifact directory, default: visual-review-output
  --scenario <id>    Capture only this scenario, repeatable, overrides impact rules
  --all              Capture every configured scenario, ignoring impact rules
  --keep-worktrees   Preserve temporary worktrees for debugging
  --help             Show this help

Exit codes:
  0  every selected scenario produced comparable evidence
  1  at least one scenario could not be captured, a partial report was still written
  2  usage, configuration, or infrastructure failure; failure.json is written when possible
  130 interrupted by SIGINT after cleanup and interruption evidence
  143 interrupted by SIGTERM after cleanup and interruption evidence
`;
}

export function parseArgs(argv) {
  const options = {
    head: 'HEAD',
    config: 'visual-review.json',
    output: 'visual-review-output',
    keepWorktrees: false,
    scenarios: [],
    all: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') options.help = true;
    else if (arg === '--keep-worktrees') options.keepWorktrees = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--scenario' || VALUE_FLAGS.includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--scenario') options.scenarios.push(value);
      else options[arg.slice(2)] = value;
      index += 1;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.help) return options;
  if (options.all && options.scenarios.length > 0) {
    throw new Error('--all cannot be combined with --scenario');
  }
  if (!options.base) throw new Error('--base is required');
  return options;
}
