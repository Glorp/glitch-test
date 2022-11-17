"use strict";
(() => {
  const escapeMap = new Map([
    ["&", "&amp;"],
    ["<", "&lt;"],
    [">", "&gt;"],
    ['"', "&quot;"],
    ["''", "&apos;"],
  ]);
  const escapeHtml = (str) => {
    let res = "";
    for (const c of str) {
      res += escapeMap.has(c) ? escapeMap.get(c) : c;
    }
    return res;
  };

  const split = (arr) => {
    const res = [];
    let current = [];
    for (const x of arr) {
      if (x.rest.str === "") {
        res.push(current);
        current = [];
      } else {
        current.push(x);
      }
    }
    res.push(current);
    return res;
  };

  const splitText = (arr) => {
    const res = split(arr);
    if (res[res.length - 1].length === 0) {
      res.pop();
    }
    if (res.length > 0 && res[0].length === 0) {
      res.shift();
    }
    return res;
  };

  const renderLines = (arr) => {
    let str = escapeHtml(arr[0].rest.str);
    for (let i = 1; i < arr.length; i++) {
      str += "<br>";
      str += escapeHtml(arr[i].rest.str);
    }
    return str;
  };

  const renderText = (arr) => {
    let str = "";
    for (const a of splitText(arr)) {
      if (a.length === 0) {
        str += "<br>";
      } else {
        str += `<p>${renderLines(a)}</p>`;
      }
    }
    return str;
  };

  const renderQuote = (arr) => {
    const splitted = split(arr);

    const pars = splitted.reduce((res, a) => (a.length > 0 ? res + 1 : res), 0);
    let str = "<blockquote>";
    for (const a of splitted) {
      if (a.length === 0) {
        str += "<br>";
      } else {
        str += pars > 1 ? `<p>${renderLines(a)}</p>` : renderLines(a);
      }
    }
    str += "</blockquote>";
    return str;
  };

  const relify = (url, dirlist) => {
    if (url[0] !== "/") {
      return url;
    }
    const urlDir = url.slice(1).split("/");
    const urlEnd = urlDir.pop();
    const len = Math.min(dirlist.length, urlDir.length);
    let i;
    for (i = 0; i < len; i++) {
      if (urlDir[i] !== dirlist[i]) {
        break;
      }
    }
    const parenting = "../".repeat(dirlist.length - i);
    const urlPath = i === urlDir.length ? "" : `${urlDir.slice(i).join("/")}/`;
    return `./${parenting}${urlPath}${urlEnd}`;
  };

  const baseLinker = (dirlist) => (token) => {
    if (token.tag === "inlink") {
      const type = token.args[0].str;
      if (type === "img") {
        return `<img src="${relify(token.args[1].str, dirlist)}" alt="${
          token.rest.str
        }">`;
      } else {
        return renderError(token.full, `unknown type "${escapeHtml(type)}"`);
      }
    }
    if (token.tag === "link") {
      const type = token.args[0].str;
      const desc = token.rest.str;
      const url = token.args[1].str;
      const descStr = desc !== "" ? desc : url;
      if (type === "gd") {
        const withHtml = `${url.endsWith(".gd") ? url.slice(0, -3) : url}.html`;
        const htmlUrl = relify(`/notes/${withHtml}`, dirlist);
        return `<a href="${htmlUrl}">${descStr}</a>`;
      }
      if (type === "url") {
        return `<a href="${relify(url, dirlist)}">${descStr}</a>`;
      }
      return renderError(token.full, `unknown type "${escapeHtml(type)}"`);
    }
    return renderError(token.full, `unkown link tag "${token.tag}"`);
  };

  const renderLinks = (arr, linker) => {
    if (arr.length === 1) {
      return `<p>${linker(arr[0])}</p>`;
    }
    let str = `<ul class="links">`;
    for (const x of arr) {
      str += `<li>${linker(x)}</li>`;
    }
    str += "</ul>";
    return str;
  };

  const renderLis = (arr) => {
    let str = "<ul>";
    for (const x of arr) {
      str += `<li>${escapeHtml(x.rest.str)}</li>`;
    }
    str += "</ul>";
    return str;
  };

  const renderError = (content, description) =>
    `<pre class="error" title="${escapeHtml(description)}">${escapeHtml(
      content
    )}</pre>`;

  const basePrextra = (alt) => alt === "" ? "" : ` title="${alt}"`;
  
  const renderPre = (arr, prextra) => {
    let str = `<pre${prextra(arr[0].rest.str)}>`;
    const len =
      arr[arr.length - 1].tag === "toggle" ? arr.length - 1 : arr.length;
    for (let i = 1; i < len; i++) {
      const token = arr[i];
      str += `${escapeHtml(token.full)}\n`;
    }
    str += "</pre>";
    return str;
  };

  const render = (arr, linker, prextra) => {
    let i;
    const gather = (tag) => {
      const res = [arr[i]];
      let next;
      for (next = i + 1; next < arr.length; next++) {
        const token = arr[next];
        if (token.tag !== tag) {
          i = next - 1;
          return res;
        }
        res.push(arr[next]);
      }
      i = next - 1;
      return res;
    };
    const gatherPre = () => {
      const res = [arr[i]];
      for (i++; i < arr.length; i++) {
        const token = arr[i];
        res.push(arr[i]);
        if (token.tag === "toggle") {
          return res;
        }
      }
      return res;
    };

    let str = "";
    for (i = 0; i < arr.length; i++) {
      const token = arr[i];

      const nextStr = () => {
        switch (token.tag) {
          case "text":
            return renderText(gather("text"));
          case "quote":
            return renderQuote(gather("quote"));
          case "link":
            return renderLinks(gather("link"), linker);
          case "li":
            return renderLis(gather("li"));
          case "hr":
            return "<hr>";
          case "toggle":
            return renderPre(gatherPre(), prextra);
          case "h1":
            return `<h1>${token.rest.str}</h1>`;
          case "h2":
            return `<h2>${token.rest.str}</h2>`;
          case "h3":
            return `<h3>${token.rest.str}</h3>`;
          case "inlink":
            return linker(token);
          case "error":
            return renderError(token.line, token.description);
          case "keyval":
            return "";
          default:
            throw "oh no";
        }
      };

      str += nextStr();
    }
    return str;
  };

  module.exports = {
    render: render,
    linker: baseLinker,
    prextra: basePrextra,
    relify: relify,
  };
})();
