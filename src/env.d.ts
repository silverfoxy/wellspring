/// <reference path="../.astro/types.d.ts" />
/// <reference path="../worker-configuration.d.ts" />

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;
type AppIdentity = import('./lib/identity').Identity;

declare namespace App {
  interface Locals extends Runtime {
    identity?: AppIdentity;
  }
}
