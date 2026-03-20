class App {
  private container: HTMLElement;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) {
      throw new Error(`Container with id '${containerId}' not found.`);
    }
    this.container = el;
  }

  public render(): void {
    this.container.innerHTML = `
      <h1>Hello from Strict TypeScript!</h1>
      <p>App is successfully bundled via esbuild.</p>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App('app');
  app.render();
});