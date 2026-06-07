declare module "*.svelte" {
  // Loose ambient type so plain tsc accepts .svelte imports; svelte-check does
  // the real component typecheck.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: any;
  export default component;
}
