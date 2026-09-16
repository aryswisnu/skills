// One facade per forge, so the CLI never branches on provider names.
//
// The three clients take different arguments (GitLab needs a host because it
// is usually self-hosted; Bitbucket takes a credential object rather than a
// bare token), so each case binds the parsed reference into a uniform shape.

import * as bitbucket from './provider-bitbucket.mjs';
import * as github from './provider-github.mjs';
import * as gitlab from './provider-gitlab.mjs';

export function providerFor(ref) {
  const { provider, host, owner, repo, number } = ref;

  if (provider === 'github') {
    return {
      name: 'GitHub',
      reference: `${owner}/${repo}#${number}`,
      tokenHint: 'GITHUB_TOKEN or GH_TOKEN',
      // Only GitHub has a working evidence-upload path (an orphan assets
      // branch plus the contents API). Web screenshots stay local elsewhere.
      supportsEvidenceUpload: true,
      rendersMermaid: true,
      rendersHtml: true,
      tokenFrom: (env) => github.githubTokenFrom(env),
      resolvePr: (auth, f) => github.resolvePr(auth, owner, repo, number, f),
      postComment: (auth, body, f) => github.postPrComment(auth, owner, repo, number, body, f),
      getBody: (auth, f) => github.getPrBody(auth, owner, repo, number, f),
      updateBody: (auth, body, f) => github.updatePrBody(auth, owner, repo, number, body, f),
    };
  }

  if (provider === 'bitbucket') {
    return {
      name: 'Bitbucket',
      reference: `${owner}/${repo}#${number}`,
      tokenHint: 'BITBUCKET_TOKEN, or BITBUCKET_USERNAME with BITBUCKET_APP_PASSWORD',
      supportsEvidenceUpload: false,
      // Bitbucket Cloud renders CommonMark only; a ```mermaid fence shows as
      // source text. Diagrams fall back to ASCII there.
      rendersMermaid: false,
      // Raw HTML such as <details> is stripped too, so nothing can be folded.
      rendersHtml: false,
      tokenFrom: (env) => bitbucket.bitbucketTokenFrom(env),
      resolvePr: (auth, f) => bitbucket.resolvePr(auth, owner, repo, number, f),
      postComment: (auth, body, f) => bitbucket.postPrComment(auth, owner, repo, number, body, f),
      getBody: (auth, f) => bitbucket.getPrBody(auth, owner, repo, number, f),
      updateBody: (auth, body, f) => bitbucket.updatePrBody(auth, owner, repo, number, body, f),
    };
  }

  if (provider === 'gitlab') {
    const projectPath = `${owner}/${repo}`;
    return {
      name: 'GitLab',
      reference: `${projectPath}!${number}`,
      tokenHint: 'GITLAB_TOKEN',
      supportsEvidenceUpload: false,
      rendersMermaid: true,
      rendersHtml: true,
      tokenFrom: (env) => gitlab.gitlabTokenFrom(env),
      resolvePr: (auth, f) => gitlab.resolvePr(auth, host, projectPath, number, f),
      postComment: (auth, body, f) => gitlab.postPrComment(auth, host, projectPath, number, body, f),
      getBody: (auth, f) => gitlab.getPrBody(auth, host, projectPath, number, f),
      updateBody: (auth, body, f) => gitlab.updatePrBody(auth, host, projectPath, number, body, f),
    };
  }

  throw new Error(`unsupported provider: ${provider}`);
}
