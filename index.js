import https from 'https';
import fs from 'fs';
import express from 'express';
import os from 'os';
import * as socketIo from 'socket.io';
import five from 'johnny-five';
import pixel from 'node-pixel';
import _ from 'lodash';
import { scheduler } from 'node:timers/promises';

const app = express();
const port = process.env.PORT || 3000;
const hostname = 'localhost';

const localIP =
	process.env.NODE_ENV !== 'production'
		? os.networkInterfaces().en0.find((a) => a.family === 'IPv4').address
		: undefined;

// Set up socket server
const key = fs.readFileSync('localhost-key.pem', 'utf-8');
const cert = fs.readFileSync('localhost.pem', 'utf-8');

const server = https.createServer({ key, cert }, app);
const io = new socketIo.Server(server, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST'],
		transport: ['websocket'],
	},
});

const NUM_LEDS = 120; // Number of LEDs in strip
const NUM_LED_SEPARATE = 52; // Number to split the strip
const DATA_PIN = 6; // Data pin for the strip

const subscribers = new Map();

const subscribe = (id, socket) => {
	if (subscribers.has(id)) {
		console.log(
			`Client with ID ${id} already connected. Disconnecting older client.`
		);
		unsubscribe(id);
	}
	subscribers.set(id, socket);
	console.log(`Connected to ${id}.`);
};

const unsubscribe = (id) => {
	subscribers.delete(id);
	console.log(`Disconnected from ${id}.`);
};

let strip = null;
let colors = ['#8F8', '#F66'];

let savedState = 0;
let index = 0;

const board = new five.Board({ repl: false });
board.on('ready', function () {
	// Define our hardware
	strip = new pixel.Strip({
		board: this,
		controller: 'FIRMATA',
		strips: [{ pin: DATA_PIN, length: NUM_LEDS }],
		gamma: 2.8,
	});

	const turnOnStrip = async (delay = 100) => {
		for (index = 0; index < NUM_LEDS - NUM_LED_SEPARATE; index++) {
			const col = savedState == 2 ? 0 : 1;

			if (index < NUM_LED_SEPARATE) strip.pixel(index).color(colors[0]);
			strip.pixel(index + NUM_LED_SEPARATE).color(colors[col]);
			strip.show();

			await scheduler.wait(1000 / delay);
		}
	};
	const turnOffStrip = () => {
		strip.off();
	};

	strip.on('ready', function () {
		console.log("Strip ready, let's go");
	});

	// Turn the Led on or off and update the state
	function toggleStrips(state, id) {
		console.log(`State: ${state}`);
		savedState = state;

		if (state == 0) {
			turnOffStrip();
		} else if (state >= 1) {
			turnOnStrip();
		}
	}

	io.on('connection', (socket) => {
		const { id } = socket.handshake.query;
		console.log(`Connection: ${id}`);

		// Add subscriber for each new connection
		subscribe(id, socket);

		// Listener for event
		socket.on('send-state', (state) => {
			toggleStrips(state, id);
		});

		// Clean up when client disconnects
		socket.on('disconnect', () => {
			unsubscribe(id);
		});
	});
});

// Start up server and log addresses for local and network
const startServer = () => {
	server.listen(port, '0.0.0.0', () => {
		console.log(`Listening at https://${hostname}:${port}`);
		if (localIP) console.log(`On Network at http://${localIP}:${port}`);
	});
};

startServer();
