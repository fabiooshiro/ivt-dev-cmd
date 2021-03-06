
"use strict";

var config = require('./config.js');
var url = 'https://grandbazaar3.herokuapp.com';
var io = require('socket.io-client');
var socket = io(url);
var readline = require('readline');
var Writable = require('stream').Writable;
var folder2watch = config.folder;
var folderInitialized = false;

var mutableStdout = new Writable({
  write: function(chunk, encoding, callback) {
    if (!this.muted) {
      process.stdout.write(chunk, encoding);
    }
    callback();
  }
});

mutableStdout.muted = false;

var rl = readline.createInterface({
  input: process.stdin,
  output: mutableStdout,
  terminal: false
});

var current_line_reader;

rl.on('line', function(line) {
  if (current_line_reader) {
    current_line_reader(line);
  }
});

function readln() {
  return new Promise((resolve, reject) => {
    current_line_reader = resolve;
  });
}

doLogin();

socket.on('readFile', (data) => {
  console.log('o servidor pediu o arquivo: ' + (folder2watch + '/' + data).replace(/\\/g,'/'));
  uploadFile(folder2watch + '/' + data, {why: 'server request'});
});

socket.on('msg', (msg) => {
  console.log(msg.msg);
});

socket.on('login_ok', () => {
  setTimeout(() => {
    doLogin();
  }, 5 * 60 * 1000);
  initWatchFolder();
});

socket.on('login_error', () => {
  doLogin();
});

async function doLogin() {
  console.log('login...');
  if (!config.username) {
    console.log('login:');
    config.username = await readln();
  }
  if (!config.password) {
    mutableStdout.muted = true;
    console.log('senha:');
    config.password = await readln();
    mutableStdout.muted = false;
  }
  let params = {
    username: config.username,
    password: config.password,
  };
  if (config.gauth_token !== false) {
    console.log('token do google authenticator:');
    params.gauth_token = await readln();
  }
  socket.emit('login', params);
}

function uploadFile(filepath, opts) {
  var request = require('request');
  var fs = require('fs');
  fs.access(filepath, fs.F_OK, (err) => {
    var formData = {
      username: config.username,
      password: config.password,
      filepath: filepath.replace(folder2watch,'').replace(folder2watch.replace(/\\/g,'/'),''),
      why: opts.why
    };
    if (err) {
      if (err.code === 'ENOENT') {
        console.log('404 ' + filepath + '...');
      } else {
        console.error(err);
      }
    } else {
      formData.file = fs.createReadStream(filepath);
      console.log('Uploading ' + filepath + '...');
    }
    request.post({url: url + '/fileupload', formData: formData}, function (err, resp, body) {
      if (err) {
        console.log('Erro: upload ' + filepath + '.');
        console.log(err);
      } else {
        console.log('Upload ' + filepath + ' ok.');
      }
    });
  });
}

function initWatchFolder() {
  if (folderInitialized) {
    return;
  }
  folderInitialized = true;
  console.log('initWatchFolder ...');
  var watch = require('node-watch');
  var fs = require('fs');
  if (!folder2watch) {
    console.log("Edite o arquivo config.js e informe a pasta para sincronizar.");
    return;
  }
  watch(folder2watch, { recursive: true }, function(evt, name) {
    var path = name.replace(/\\/g, '/');
    fs.stat(path, function(err, stat) {
      if (err) {
        console.error(err);
        return;
      }
      if (stat.isFile()) {
        console.log('File %s changed.', path);
        uploadFile(path, {why: 'save'});
      }
    });
  });
}
