"use strict";(()=>{var e=class{container;constructor(n){let t=document.getElementById(n);if(!t)throw new Error(`Container with id '${n}' not found.`);this.container=t}render(){this.container.innerHTML=`
      <h1>Hello from Strict TypeScript!</h1>
      <p>App is successfully bundled via esbuild.</p>
    `}};document.addEventListener("DOMContentLoaded",()=>{new e("app").render()});})();
//# sourceMappingURL=app.js.map
