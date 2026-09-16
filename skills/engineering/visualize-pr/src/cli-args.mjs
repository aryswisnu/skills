const VALUE_FLAGS = ['--base', '--head', '--config', '--output', '--pr', '--diagram'];

export function usage() {
  return `Usage: visualize-pr --base <ref> [--head <ref>] [options]
       visualize-pr --pr <github-pull-request-url> [options]

Options:
  --base <ref>       Base git revision, required unless --pr is used
  --head <ref>       Head git revision, default: HEAD
  --pr <url>         GitHub pull request URL; resolves base and head SHAs
  --backend          Analyze the diff and emit a change summary + Mermaid change map (no browser)
  --diagram <path>   Mermaid file (for example a sequenceDiagram) to include in the report and PR text
  --config <path>    Config path, default: visual-review.json
  --init             Write a starter visual-review.json for this repo, then exit
  --setup            Install this skill's npm dependencies and Chromium, then exit
                     (add --backend to skip the browser download)
  --output <path>    Artifact directory, default: visual-review-output
  --scenario <id>    Capture only this scenario, repeatable, overrides impact rules
  --all              Capture every configured scenario, ignoring impact rules
  --post-comment     Post the generated review as a PR comment (requires --pr)
  --update-description  Insert or refresh the review section in the PR description (requires --pr)
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
    pr: null,
    postComment: false,
    diagram: null,
    updateDescription: false,
    backend: false,
    init: false,
    setup: false,
    help: false,
  };
  let headExplicit = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') options.help = true;
    else if (arg === '--keep-worktrees') options.keepWorktrees = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--post-comment') options.postComment = true;
    else if (arg === '--update-description') options.updateDescription = true;
    else if (arg === '--backend') options.backend = true;
    else if (arg === '--init') options.init = true;
    else if (arg === '--setup') options.setup = true;
    else if (arg === '--scenario' || VALUE_FLAGS.includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--scenario') options.scenarios.push(value);
      else options[arg.slice(2)] = value;
      if (arg === '--head') headExplicit = true;
      index += 1;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.help) return options;
  if (options.all && options.scenarios.length > 0) {
    throw new Error('--all cannot be combined with --scenario');
  }
  if (options.setup) {
    const conflicts = [
      ['--pr', Boolean(options.pr)],
      ['--base', Boolean(options.base)],
      ['--init', options.init],
      ['--post-comment', options.postComment],
      ['--update-description', options.updateDescription],
      ['--diagram', Boolean(options.diagram)],
    ];
    const conflict = conflicts.find(([, present]) => present);
    if (conflict) throw new Error(`--setup cannot be combined with ${conflict[0]}`);
    return options;
  }
  if (options.init) {
    const conflicts = [
      ['--pr', Boolean(options.pr)],
      ['--base', Boolean(options.base)],
      ['--backend', options.backend],
      ['--post-comment', options.postComment],
      ['--update-description', options.updateDescription],
      ['--diagram', Boolean(options.diagram)],
    ];
    const conflict = conflicts.find(([, present]) => present);
    if (conflict) throw new Error(`--init cannot be combined with ${conflict[0]}`);
    return options;
  }
  if (options.pr && options.base) {
    throw new Error('--pr cannot be combined with --base');
  }
  if (options.pr && headExplicit) {
    throw new Error('--pr cannot be combined with --head');
  }
  if (options.postComment && !options.pr) {
    throw new Error('--post-comment requires --pr');
  }
  if (options.updateDescription && !options.pr) {
    throw new Error('--update-description requires --pr');
  }
  if (!options.pr && !options.base) {
    throw new Error('--base or --pr is required');
  }
  return options;
}
