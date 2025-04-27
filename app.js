// ----------------- IMPORTS -----------------
import fs from "fs";
import path from "path";
import express from "express";
import http from "http";
import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
} from "@discordjs/voice";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import ytdl from "@distube/ytdl-core";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jsonPath = path.join(__dirname, "static", "library.json");

// ----------------- CHARGEMENT DU JSON -----------------
const rawdata = fs.readFileSync(jsonPath);
const myJson = JSON.parse(rawdata).library;

// ----------------- DISCORD BOT -----------------
const token = process.env.CLIENT_TOKEN;
console.log("Token lu :", token); // Ne laisse pas ça en prod évidemment
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel],
});

client.once(Events.ClientReady, () => {
    console.log("ALFRED est Connecté");
    client.user.setActivity("Alfredo aide moi");
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // Commande d'aide
    if (message.content === "Alfredo aide moi") {
        const helpList = myJson.map((sound) => sound.cmd).join("\n");
        message.reply(
            "Voici les services que je propose mon brave:\n" + helpList,
        );
        return;
    }

    // Recherche et exécution d'un son
    const found = myJson.find((sound) => sound.cmd === message.content);
    if (!found) return;

    const channel = message.member?.voice?.channel;
    if (!channel) {
        message.reply(
            "Tu dois être dans un salon vocal pour utiliser cette commande !",
        );
        return;
    }

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Stop,
        },
    });

    const resource = createAudioResource(found.path);
    connection.subscribe(player);
    player.play(resource);

    player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
    });

    player.on("error", (error) => {
        console.error("Erreur audio :", error);
        connection.destroy();
    });
});

// ----------------- SERVEUR EXPRESS -----------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set("port", 8080);
app.use("/static", express.static(path.join(__dirname, "static")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

server.listen(8080, () => {
    console.log("Starting server on port 8080");
});

// ----------------- SOCKET.IO -----------------
io.on("connection", (socket) => {
    console.log("Un Soundboarder s'est connecté.");

    let isPlaying = false;

    socket.on("sound", async (filePath) => {
        console.log(filePath + " a été activé");

        if (isPlaying) {
            console.log("Un son est déjà en cours de lecture.");
            socket.emit("error", "Un autre son est déjà en cours de lecture.");
            return;
        }

        // Recommandé : sécuriser cette partie (valider le chemin)
        const currentChannel = client.channels.cache.get("954088649690079292");
        if (!currentChannel || currentChannel.type !== 2) return;

        const connection = joinVoiceChannel({
            channelId: currentChannel.id,
            guildId: currentChannel.guild.id,
            adapterCreator: currentChannel.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause,
            },
        });

        const resource = createAudioResource(filePath);
        connection.subscribe(player);
        isPlaying = true;
        player.play(resource);

        // Quand le joueur est inactif (son terminé)
        player.on("stateChange", (oldState, newState) => {
            if (newState.status === AudioPlayerStatus.Idle) {
                console.log("Le son est terminé, déconnexion...");
                socket.emit("soundFinished"); // Informer le client que le son est terminé
                connection.destroy(); // Déconnexion du canal vocal
                isPlaying = false;
            }
        });

        player.on("error", (error) => {
            console.error("Erreur audio (web):", error);
            connection.destroy();
            isPlaying = false;
        });
    });

    socket.on("youtubeSound", async (url) => {
        try {
            let info = await ytdl.getInfo(url).then(info => {
                return info;
            });

            const formats = info.formats;
            const format = formats.filter(f => f.audioQuality === 'AUDIO_QUALITY_MEDIUM' && f.hasVideo === false && f.container === 'webm');

            const resource = createAudioResource(
                ytdl(url, { format: format?.[0] }),
            );
            const player = createAudioPlayer();

            const currentChannel = client.channels.cache.get("954088649690079292");
            if (!currentChannel || currentChannel.type !== 2) return;

            // Connexion et lecture du son
            const connection = joinVoiceChannel({
                channelId: currentChannel.id,
                guildId: currentChannel.guild.id,
                adapterCreator: currentChannel.guild.voiceAdapterCreator,
            });

            connection.subscribe(player);
            player.play(resource);

            player.on("stateChange", (oldState, newState) => {
                if (newState.status === AudioPlayerStatus.Idle) {
                    console.log("Le son youtube est terminé, déconnexion...");
                    connection.destroy();
                }
            });

            player.on("error", (error) => {
                console.error("Erreur audio (YouTube):", error);
                connection.destroy();
            });
        } catch (error) {
            console.error("Erreur lors du traitement de l'URL YouTube:", error);
            socket.emit(
                "error",
                "Erreur lors de la lecture de la vidéo YouTube.",
            );
        }
    });
});

// ----------------- LOGIN -----------------
client.login(token);
