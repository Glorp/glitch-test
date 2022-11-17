"use strict";
(() => {
  class StrWs {
    constructor(str, ws) {
      this.str = str;
      this.ws = ws;
    }
    get length() {
      return this.str.length + this.ws.length;
    }
    get full() {
      return `${this.str}${this.ws}`;
    }
  }

  const strws = (str, ws) => new StrWs(str, ws);

  const isWs = (s) => s === " " || s == "\t";

  const ws = (str, start) => {
    let i;
    for (i = start; i < str.length && isWs(str[i]); i++) {}
    return str.substring(start, i);
  };
  const start = (lstr, str) => {
    if (!str.startsWith(lstr)) {
      return null;
    }
    return strws(lstr, ws(str, lstr.length));
  };

  const word = (str, start) => {
    let res = "";
    let i;
    for (i = start; i < str.length && !isWs(str[i]); i++) {}
    if (i == start) {
      return null;
    }
    return strws(str.substring(start, i), ws(str, i));
  };

  const rest = (str, start) => {
    let res = "";
    let ws = "";
    for (let i = start; i < str.length; i++) {
      const c = str[i];
      if (isWs(c)) {
        ws += c;
      } else {
        res += ws;
        ws = "";
        res += c;
      }
    }
    return strws(res, ws);
  };

  const parser = (tag, startWord, args) => (str) => {
    const first = start(startWord, str);
    if (first === null) {
      return null;
    }
    let pos = first.length;
    if (args === undefined) {
      return new Token(tag, first, [], rest(str, pos));
    }
    const words = [];
    for (let i = 0; i < args; i++) {
      const current = word(str, pos);
      if (current === null) {
        return new ErrorToken(str, "missing some stuff");
      }
      pos += current.length;
      words.push(current);
    }
    return new Token(tag, first, words, rest(str, pos));
  };

  
  class Token {
    constructor(tag, start, args, rest) {
      this.tag = tag;
      this.start = start;
      this.args = args;
      this.rest = rest;
    }
    get full() {
      let res = this.start.full;
      for (const sw of this.args) {
        res += sw.full;
      }
      res += this.rest.full;
      return res;
    }
    
  }
  
  class ErrorToken {
    constructor(line, description) {
      this.tag = "error";
      this.line = line;
      this.description = description;
    }
    get full() {
      return this.line;
    }
  }

  const toggleParser = parser("toggle", "```");
  const textParser = parser("text", "");
  const parsers = [
    parser("h3", "###"),
    parser("h2", "##"),
    parser("h1", "#"),
    parser("quote", ">"),
    parser("link", "=>", 2),
    parser("inlink", "<=", 2),
    parser("li", "*"),
    parser("hr", "----"),
    parser("keyval", ":", 1),
    parser("text", "|"),
    textParser,
  ];

  const tokenFrom = (str) => {
    for (const x of parsers) {
      const res = x(str);
      if (res !== null) {
        return res;
      }
    }
  };

  const parse = (str) => {
    let title = null;
    const res = [];
    const meta = new Map();

    const push = (token) => {
      const t = token.tag;
      if (t === "keyval") {
        const k = token.args[0].str;
        if (meta.has(k)) {
          res.push(new ErrorToken(token.full, `key "${k}" already used`));
          return;
        } else {
          meta.set(k, token.rest.str);
        }
      }
      res.push(token);
      if (t === "h1") {
        if (title === null) {
          title = token.rest.str;
        }
      }
    };

    let pre = false;
    const line = () => {
      const tg = toggleParser(buf);
      if (tg !== null) {
        pre = !pre;
        push(tg);
      } else if (pre) {
        push(textParser(buf));
      } else {
        push(tokenFrom(buf));
      }
      buf = "";
    };

    let prevCr = false;
    let buf = "";
    for (const c of str) {
      const cr = c === "\r";
      if (cr) {
        line();
      } else if (c === "\n") {
        if (!prevCr) {
          line();
        }
      } else {
        buf += c;
      }
    }
    line();
    return {
      parsed: res,
      title: title === null ? "untitled" : title,
      meta: meta
    };
  };

  module.exports = {
    parse: parse
  };
})();
