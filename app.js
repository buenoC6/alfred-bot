var token = process.env.TOKEN;
const Discord = require('discord.js');
const fs = require('fs');
const client = new Discord.Client();
let rawdata = fs.readFileSync('static/library.json')
let myJson = JSON.parse(rawdata).library;

client.on("ready", function () {
    console.log("ALFRED est Connecté");
    client.user.setActivity('Alfredo aide moi');
})

client.on('message', message => {
  for (var i = 0, len = myJson.length; i < len; i++) {
    if (message.content === myJson[i].cmd ) {
      var path = myJson[i].path+"";
      const channel = message.member.voice.channel;
      channel.join()
      .then(connection => {
        const dispatcher = connection.play(path, { volume: 0.5 });;
        dispatcher.on("end", end => {connection.disconnect});
      })
      .catch(console.error);
    }
  }
});

client.on('message', msg => {
  if (msg.content === 'Alfredo aide moi') {
    var helpList = "";
    for (var i = 0, len = myJson.length; i < len; i++) {
      helpList+=myJson[i].cmd+"\n";
    }
    msg.reply('Voici les services que je propose mon brave: \n'+helpList);
  }
});


client.login(token);

// Dependencies
var express = require('express');
var http = require('http');
var path = require('path');
var app = express();
var server = http.Server(app);
var socketIO = require('socket.io');
var io = socketIO.listen(server);


app.use('/', express.static(__dirname + '/'));
// Routing
app.get('/', function(request, response) {
  response.sendFile(path.join(__dirname, 'index.html'));
});
// Starts the server.
server.listen(8080, function() {
  console.log('Starting server on port 8080');
});

io.on('connection', function(socket) {
  console.log("Un Soundboarder s'est connecté.");
  socket.on('sound', function(file) {
    console.log(file+" a été activé");
    client.channels.cache.get('445294788976050186').join()
    .then(connection => {
      const dispatcher = connection.play(file, { volume: 0.5 });;
      dispatcher.on("end", end => {connection.disconnect});
    })
    .catch(console.error);
  });
});
