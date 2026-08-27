/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TEST_HOOK?: string
  readonly VITE_APP_ENV?: string
}

declare const __APP_VERSION__: string
declare const __ROIS_APP_VERSION__: string

// Static asset type declarations
declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
