// The list of explainers shown in the "Learn" section of the home page.
//
// To add an explainer:
//   1. Add an entry to EXPLAINERS below.
//   2. Create public/explainers/<id>.js that calls
//        Explainers.define("<id>", (root) => { ...build into root...; return cleanup; });
//      The page loads that file the first time someone opens the explainer.
//      `root` is an empty element to draw into; return a function that undoes
//      anything set up outside `root` (timers, window listeners), or nothing.
window.Explainers = {
  list: [
    {
      id: "split-multiplication",
      emoji: "✂️",
      title: "Split it up!",
      description: "Cut a hard multiplication like 16 × 17 into easy pieces you can do in your head.",
    },
  ],

  modules: {},

  define(id, mount) {
    this.modules[id] = mount;
  },

  // Load an explainer's script (once) and resolve with its mount function.
  load(id) {
    if (this.modules[id]) return Promise.resolve(this.modules[id]);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `explainers/${encodeURIComponent(id)}.js`;
      script.onload = () =>
        this.modules[id] ? resolve(this.modules[id]) : reject(new Error(`Explainer "${id}" didn't load`));
      script.onerror = () => reject(new Error(`Couldn't load the "${id}" explainer`));
      document.head.appendChild(script);
    });
  },
};
