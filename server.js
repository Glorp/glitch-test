"use strict";
const path = require("path");
const fs = require("fs");

const parse = require("./public/parse.js");
const render = require("./public/renderHtml.js");
const gdDir = "./.data/gd/";
const gdNotesDir = `${gdDir}notes/`;
const notesFile = `${gdDir}notes.json`;
let assets = new Map();
let notes = new Map();

const noteInfo = (filename, title, date) => ({
  filename: filename,
  title: title,
  date: date,
});

const readStuff = (succeed, fail) => {
  const halp = (succeed, fail) => {
    const res = { assets: null, files: null, info: null };

    const maybeSucceed = () => {
      if (res.assets !== null && res.files !== null && res.info !== null) {
        succeed(res);
      }
    };

    const assetsMap = new Map();
    const lineReader = require("readline").createInterface({
      input: fs.createReadStream(".glitch-assets"),
    });

    lineReader.on("error", (err) => {
      console.log(err);
      fail();
    });
    lineReader.on("line", (line) => {
      try {
        const json = JSON.parse(line);
        const id = json.uuid;
        if (json.deleted === true) {
          assetsMap.delete(id);
        } else {
          assetsMap.set(id, { name: json.name, url: json.url });
        }
      } catch (err) {
        console.log(err);
      }
    });
    lineReader.on("close", () => {
      const assets = new Map();
      for (const x of [...assetsMap.values()]) {
        assets.set(x.name, x.url);
      }
      res.assets = assets;
      maybeSucceed();
    });

    fs.readdir(gdNotesDir, {}, (err, files) => {
      if (err) {
        console.log(err);
        fail();
      } else {
        res.files = files;
        maybeSucceed();
      }
    });

    fs.readFile(notesFile, (err, str) => {
      if (err) {
        console.log(err);
        fail();
      } else {
        const map = new Map();
        for (const x of JSON.parse(str)) {
          map.set(x.file, x);
        }
        res.info = map;
        maybeSucceed();
      }
    });
  };

  halp((res) => {
    const map = res.info;
    const info = new Map();
    for (const file of res.files) {
      if (map.has(file)) {
        info.set(file, map.get(file));
      } else {
        info.set(file, { file: file, title: "unkown", date: null });
      }
    }
    notes = info;
    assets = res.assets;
    succeed();
  }, fail);
};

readStuff(
  () => {},
  () => {}
);

const fastify = require("fastify")({
  logger: false,
  ignoreTrailingSlash: true,
});

fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
  decorateReply: false,
});

fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, gdDir),
  prefix: "/gd/",
  decorateReply: false,
});

// Formbody lets us parse incoming forms
fastify.register(require("@fastify/formbody"));

// View is a templating manager for fastify
fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: require("handlebars"),
  },
});

fastify.get("/", (request, reply) => {
  return reply.view("/src/pages/index.hbs", {});
});

const ploxauth = (reply) => {
  reply.code(401).header("WWW-Authenticate", "Basic").send();
  return false;
};

const check = (name, password, succeed, fail) => {
  if (process.env.NAME === name && process.env.PASSWORD === password) {
    succeed();
  } else {
    fail();
  }
};

const authView = (request, reply, file, params) => {
  auth(
    request.headers.authorization,
    (name) => {
      params.login = name;
      reply.view(file, params);
    },
    () => {
      params.login = null;
      reply.view(file, params);
    }
  );
};

const auth = (str, succeed, fail) => {
  if (typeof str !== "string") {
    return fail();
  }
  if (str.slice(0, 6) !== "Basic ") {
    return fail();
  }
  const buff = new Buffer.from(str.slice(6), "base64");
  const decoded = buff.toString("ascii").split(":");
  check(decoded[0], decoded[1], succeed, fail);
};

const writeFile = (path, content, reply, succeed) => {
  fs.writeFile(
    path,
    content,
    {
      encoding: "utf8",
      flag: "w",
    },
    (err) => {
      if (err) {
        console.log(err);
        reply.statusCode = 500;
        return;
      }
      succeed();
    }
  );
};

const fileExists = (path, dir, reply, succeed) => {
  fs.stat(path, (err, stat) => {
    if (err) {
      if (err.code === "ENOENT") {
        succeed(false);
        return;
      }
      console.log(err);
      reply.statusCode = 500;
      reply.send();
      return;
    }
    if (stat.isDirectory() === dir) {
      succeed(true);
      return;
    }
    console.log(
      `stat.isDirectory() !== dir (${stat.isDirectory()} !== ${false})`
    );
    reply.statusCode = 500;
    reply.send();
  });
};

const dirExists = () => {};

fastify.put("/gd/notes/:name", (request, reply) => {
  const name = request.params.name;
  const content = request.body;
  const path = `${gdNotesDir}${name}`;

  auth(
    request.headers.authorization,
    (user) => {
      fileExists(path, false, reply, (exists) => {
        if (!exists) {
          reply.statusCode = 409;
          reply.send(`"${name}" does not exist`);
          return;
        }
        writeFile(path, content, reply, () => {
          updateNotes(name, content);
          sendStuff(reply);
        });
      });
    },
    () => {
      ploxauth(reply);
    }
  );
});

fastify.put("/gd/index.gd", (request, reply) => {
  const content = request.body;
  const path = `${gdDir}index.gd`;

  auth(
    request.headers.authorization,
    (user) => writeFile(path, content, reply, () => sendStuff(reply)),
    () => {
      ploxauth(reply);
    }
  );
});

const saveNotes = () =>
  fs.writeFile(
    notesFile,
    JSON.stringify([...notes.values()]),
    {
      encoding: "utf8",
      flag: "w",
    },
    (err) => console.log
  );

const updateNotes = (file, str) => {
  const parsed = parse.parse(str);
  const info = {
    file: file,
    title: parsed.title,
    date: parsed.meta.has("date") ? parsed.meta.get("date") : null,
  };
  const changed = () => {
    if (!notes.has(file)) {
      return true;
    }
    const old = notes.get(file);
    return old.title !== info.title || old.date !== info.date;
  };
  if (changed()) {
    notes.set(file, info);
    saveNotes();
  }
};

fastify.post("/gd/notes/:name", (request, reply) => {
  const name = request.params.name;
  console.log(name);
  const content = request.body;
  const path = `${gdNotesDir}${name}`;

  auth(
    request.headers.authorization,
    (user) => {
      fileExists(path, false, reply, (exists) => {
        if (exists) {
          reply.statusCode = 409;
          reply.send(`"${name}" already exists`);
          return;
        }
        writeFile(path, content, reply, () => {
          updateNotes(name, content);
          sendStuff(reply);
        });
      });
    },
    () => {
      ploxauth(reply);
    }
  );
});

fastify.delete("/gd/notes/:name", (request, reply) => {
  const name = request.params.name;
  const path = `${gdNotesDir}${name}`;

  auth(
    request.headers.authorization,
    (user) => {
      fileExists(path, false, reply, (exists) => {
        if (!exists) {
          reply.statusCode = 409;
          reply.send(`"${name}" already exists`);
          return;
        }
        fs.unlink(path, (err) => {
          if (err) {
            console.log(err);
            reply.statusCode = 500;
            reply.send();
            return;
          }
          notes.delete(name);
          saveNotes();
          sendStuff(reply);
        });
      });
    },
    () => {
      ploxauth(reply);
    }
  );
});

const sendStuff = (reply) => {
  reply.send({ assets: [...assets.keys()], notes: [...notes.values()] });
};

fastify.get("/stuff", (request, reply) => sendStuff(reply));

fastify.post("/stuff", (request, reply) =>
  readStuff(
    () => sendStuff(reply),
    () => {
      reply.statusCode = 500;
      reply.send();
    }
  )
);

fastify.get("/assets/:name", (request, reply) => {
  const name = request.params.name;
  if (assets.has(name)) {
    reply.redirect(303, assets.get(name));
  } else {
    reply.statusCode = 404;
    reply.send();
  }
});

fastify.listen(
  { port: process.env.PORT, host: "0.0.0.0" },
  function (err, address) {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    console.log(`Your app is listening on ${address}`);
    fastify.log.info(`server listening on ${address}`);
  }
);
