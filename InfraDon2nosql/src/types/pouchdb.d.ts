/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'pouchdb-browser' {
  const PouchDB: any
  export default PouchDB
}

declare module 'pouchdb-find' {
  const plugin: any
  export default plugin
}
