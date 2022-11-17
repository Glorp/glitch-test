"use strict";
const [module, require] = (() => {
  const stuff = new Map();
  const t = {};

  const scriptSrc = () => {
    const scr = document.currentScript;
    if (scr === null) {
      return null;
    }
    return scr.getAttribute("src");
  };

  const currentdir = () => {
    const str = scriptSrc();
    if (str === null) {
      return ["."];
    }
    return str.split("/").slice(0, -1);
  };

  const module = {
    get exports() {
      const str = scriptSrc();
      if (str === null) {
        throw "oh no";
      }
      if (!stuff.has(str)) {
        stuff.set(str, {});
      }
      return stuff.get(str);
    },
    set exports(obj) {
      const str = scriptSrc();
      if (str === null) {
        throw "oh no";
      }
      stuff.set(str, obj);
    }
  };

  const require = (str) => {
    const path = currentdir();
    for (const s of str.split("/")) {
      if (s === ".") {

      } else if (s === "..") {
        path.pop();
      } else {
        path.push(s);
      }
    }
    const pathstr = path.join("/");
    if (!stuff.has(pathstr)) {
      throw "oh no";
    }
    return stuff.get(pathstr);
  };

  return [module, require];
})();
