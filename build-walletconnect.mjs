import esbuild from 'esbuild';
const id = process.env.WALLETCONNECT_PROJECT_ID;
if (!id || !/^[a-zA-Z0-9_-]{32,128}$/.test(id)) {
  throw new Error('WALLETCONNECT_PROJECT_ID is required at build time');
}
await esbuild.build({
  entryPoints: ['src/walletconnect-appkit.js'],
  outfile: 'assets/walletconnect-appkit.js',
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  platform: 'browser',
  define: { __WALLETCONNECT_PROJECT_ID__: JSON.stringify(id) },
  logLevel: 'warning',
});
