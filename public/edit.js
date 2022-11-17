"use strict";
/* require */

(() => {
  const elem = (parent, type, text) => {
    const el = document.createElement(type);
    parent.appendChilc(el);
    el.innerText = text;
    return el;
  };

  const render = require("./renderHtml.js");
  const parse = require("./parse.js").parse;

  const previewSoon = (() => {
    let time = null;

    const timer = () => {
      const t = time;
      if (t === null) {
        return;
      } else if (t > 0) {
        time = t - 1;
        setTimeout(timer, 100);
      } else {
        time = null;
        for (const ed of editors) {
          ed.preview();
        }
      }
    };

    return () => {
      const t = time;
      time = 10;
      if (t === null) {
        timer();
      }
    };
  })();

  const editors = [];

  const send = (verb, url, str, succeed, fail) => {
    const xhr = new XMLHttpRequest();
    xhr.open(verb, url, true);

    xhr.setRequestHeader("Content-type", "text/plain; charset=UTF-8");

    xhr.onreadystatechange = () => {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          succeed(xhr.responseText);
        } else {
          fail(xhr.status + " " + xhr.statusText, xhr.responseText);
        }
      }
    };
    xhr.send(str);
  };

  const notesEl = document.getElementById("notes");

  const editorsEl = document.getElementById("editors");

  const openNote = (file) => () => {
    for (const div of editors) {
      if (div.isSameFile(file)) {
        div.scrollIntoView();
        div.textFocus();
        return;
      }
    }

    send(
      "GET",
      `/gd/notes/${file}`,
      null,
      (str) => makeEditor(file, false, str),
      (status, str) => console.log(`${status}: ${str}`)
    );
  };

  const indexLi = (() => {
    const li = document.createElement("li");
    notesEl.appendChild(li);
    const button = document.createElement("button");
    button.className = "note-link";
    li.appendChild(button);
    button.innerText = "../index.gd";
    button.onclick = openNote("../index.gd");
    return li;
  })();

  let assets = [];
  const setStuff = (str) => {
    const obj = JSON.parse(str);
    assets = obj.assets;
    for (const ed of editors) {
      ed.setAssets(assets);
    }
    notesEl.innerHTML = "";
    obj.notes.sort((a, b) =>
      (b.date === null ? "a" : b.date).localeCompare(
        a.date === null ? "a" : a.date
      )
    );
    for (const x of obj.notes) {
      const li = document.createElement("li");
      notesEl.appendChild(li);
      const button = document.createElement("button");
      button.className = "note-link";
      li.appendChild(button);
      button.append(x.title);
      button.appendChild(document.createElement("br"));
      button.append(`(${x.file}${x.date === null ? "" : `, ${x.date}`})`);
      button.onclick = openNote(x.file);
    }
    notesEl.appendChild(indexLi);
    filterNotes();
  };

  send("GET", "/stuff", null, setStuff, (status, str) =>
    console.log(`${status}: ${str}`)
  );

  const makeEditor = (fname, isItNew, str) => {
    let modified = "nope";
    let previewDirty = true;
    const modi = () => {
      modified = "yep";
      previewDirty = true;
      previewSoon();
    };

    let isNew = isItNew;
    const div = document.createElement("div");
    div.classList.add("editor-and-preview");
    const editorDiv = document.createElement("div");
    div.appendChild(editorDiv);
    editorDiv.classList.add("editor-container");

    const toolbarFile = document.createElement("div");
    editorDiv.appendChild(toolbarFile);
    const filename = document.createElement("input");
    toolbarFile.appendChild(filename);
    filename.type = "text";
    filename.value = fname;
    filename.readOnly = !isNew;
    const saveButton = document.createElement("button");
    toolbarFile.appendChild(saveButton);
    saveButton.title = "Save";
    saveButton.innerText = "💾";
    const closeButton = document.createElement("button");
    toolbarFile.appendChild(closeButton);
    closeButton.innerText = "🗙";
    closeButton.onclick = () => {
      if (modified !== "nope") {
        if (!window.confirm("there are unsaved changes. you sure?")) {
          return;
        }
      }
      div.remove();
      for (let i = 0; i < editors.length; i++) {
        if (editors[i] === div) {
          editors.splice(i, 1);
          return;
        }
      }
    };
    const deleteButton = document.createElement("button");
    toolbarFile.appendChild(deleteButton);
    deleteButton.innerText = "␡";
    deleteButton.title = "Delete";

    const status = document.createElement("snip");
    toolbarFile.appendChild(status);
    const statusGood = (str) => {
      status.innerText = str;
      status.className = "";
    };
    const statusBad = (str) => {
      status.innerText = str;
      status.className = "error";
    };
    if (isNew) {
      statusGood("new thing");
    }

    const toolbar = document.createElement("div");
    editorDiv.appendChild(toolbar);

    for (const [name, open, close] of [
      ["```", "```\n", "\n```"],
      ["“”", "“", "”"],
    ]) {
      const btn = document.createElement("button");
      toolbar.appendChild(btn);
      btn.innerText = name;
      btn.onclick = () => {
        surroundSelection(open, close);
        editor.focus();
      };
    }
    const assetSelect = document.createElement("select");
    toolbar.appendChild(assetSelect);
    const previewButton = document.createElement("button");
    previewButton.innerText = "Preview";
    toolbar.appendChild(previewButton);

    const editor = document.createElement("textarea");
    editorDiv.appendChild(editor);
    editor.classList.add("editor");
    editor.wrap = "off";
    editor.value = str;
    const preview = document.createElement("div");
    div.appendChild(preview);

    const baseLinker = render.linker([]);
    const linker = (token) => {
      const type = token.args[0].str;
      const desc = token.rest.str;
      const file = token.args[1].str;
      const descStr = desc !== "" ? desc : file;
      if (token.tag === "link" && type === "gd") {
        return `<a class="gd-link" data-file="${file}">${descStr}</a>`;
      }
      return baseLinker(token);
    };

    const p = () => {
      const parsed = parse(editor.value).parsed;
      preview.innerHTML = render.render(parsed, linker, render.prextra);
      for (const gdlink of preview.getElementsByClassName("gd-link")) {
        gdlink.onclick = openNote(gdlink.dataset.file);
      }
      previewDirty = false;
    };
    previewButton.onclick = p;

    div.preview = () => {
      if (previewDirty) {
        p();
      }
    };

    const replaceSelection = (replacement) => {
      const str = editor.value;
      const before = str.substring(0, editor.selectionStart);
      const after = str.substring(editor.selectionEnd);
      const dir = editor.selectionDirection;
      editor.value = `${before}${replacement}${after}`;
      editor.setSelectionRange(
        before.length,
        before.length + replacement.length,
        dir
      );
      modi();
    };

    const surroundSelection = (open, close) => {
      const str = editor.value;
      const before = str.substring(0, editor.selectionStart);
      const selected = str.substring(
        editor.selectionStart,
        editor.selectionEnd
      );
      const after = str.substring(editor.selectionEnd);
      const dir = editor.selectionDirection;
      editor.value = `${before}${open}${selected}${close}${after}`;
      editor.setSelectionRange(
        before.length + open.length,
        before.length + open.length + selected.length,
        dir
      );
      modi();
    };

    assetSelect.onchange = () => {
      const value = assetSelect.value;
      if (value !== "nope") {
        replaceSelection(`\n<= img /assets/${value}\n`);
        editor.focus();
      }
      assetSelect.value = "nope";
    };

    div.setAssets = (assets) => {
      assetSelect.innerHTML = `<option value="nope">Insert something</option>`;
      for (const name of assets) {
        const opt = document.createElement("option");
        assetSelect.appendChild(opt);
        opt.innerText = name;
        opt.value = name;
      }
    };
    div.setAssets(assets);

    const refresh = () => {
      deleteButton.disabled = isNew;
      filename.readOnly = !isNew;
    };
    refresh();

    saveButton.onclick = () => {
      let f = filename.value.trim();
      if (f === "") {
        statusBad("no filename");
        return;
      }
      if (isNew && !f.endsWith(".gd")) {
        f = `${f}.gd`;
      }
      filename.value = f;
      modified = "saving";
      send(
        isNew ? "POST" : "PUT",
        `/gd/notes/${f}`,
        editor.value,
        (str) => {
          if (modified !== "yep") {
            modified = "nope";
          }
          setStuff(str);
          isNew = false;
          refresh();
          statusGood("saved");
        },
        (status, str) => {
          modified = "yep";
          statusBad(`${status}: ${str}`);
        }
      );
    };

    deleteButton.onclick = () => {
      const f = filename.value.trim();
      if (!window.confirm(`sure you want to **REMOVE** "${f}"???`)) {
        return;
      }
      send(
        "DELETE",
        `/gd/notes/${f}`,
        editor.value,
        (str) => {
          setStuff(str);
          isNew = true;
          refresh();
          statusGood("deleted");
        },
        (status, str) => statusBad(`${status}: ${str}`)
      );
    };

    div.textFocus = () => editor.focus();
    div.isDirty = () => modified !== "nope";
    editor.oninput = modi;
    p();
    div.isSameFile = (str) => !isNew && filename.value.trim() === str;
    editorsEl.insertBefore(div, editorsEl.firstChild);
    editors.push(div);
    div.scrollIntoView();
    div.textFocus();
  };

  const newNote = document.getElementById("new-note");
  newNote.onclick = () => makeEditor("", true, "# bla bla\n\n");
  const refresh = document.getElementById("refresh");
  refresh.onclick = () =>
    send("GET", "/stuff", null, setStuff, (status, str) =>
      console.log(`${status}: ${str}`)
    );

  window.addEventListener("beforeunload", (e) => {
    console.log(editors);
    confirm("bla bla");
    if (editors.some((x) => x.isDirty())) {
      e.preventDefault();
      return (event.returnValue = "there are unsaved changes");
    }
  });

  const notesFilter = document.getElementById("notes-filter");
  const filterNotes = () => {
    for (const x of notesEl.children) {
      const str = notesFilter.value;
      x.className = x.children[0].innerText.includes(str) ? "" : "hidden";
    }
  };
  notesFilter.oninput = filterNotes;
})();
