import https from 'https';
import fs from 'fs';
import express from 'express';
import os from 'os';
import * as socketIo from 'socket.io';
import five from 'johnny-five';
import pixel from 'node-pixel';
import _ from 'lodash';

const app = express();
const hostname = 'localhost';

const localIP = os
	.networkInterfaces()
	.en0.find((a) => a.family === 'IPv4').address;

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

// const colors = ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'white'];
const colors = ['blue', 'yellow'];
function getRandomColor(color = null) {
	const randomInt = _.floor(_.random(colors.length - 1));
	const randomColor = colors[randomInt];

	if (color !== null && color === randomColor) return getRandomColor(color);
	else return randomColor;
}

let randomColor1 = getRandomColor();
let randomColor2 = getRandomColor();

let strip = null;
const board = new five.Board({ repl: false });
board.on('ready', function () {
	// Define our hardware
	strip = new pixel.Strip({
		board: this,
		controller: 'FIRMATA',
		strips: [{ pin: DATA_PIN, length: NUM_LEDS }],
		gamma: 2.8,
	});

	const turnOnStrip = (color, start = 0, end = NUM_LEDS) => {
		if (start === 0 && end === NUM_LEDS) strip.color(color);
		else {
			for (const i of _.range(start, end)) {
				strip.pixel(i).color(color);
			}
		}

		// Send instructions to LED strip
		strip.show();
	};
	const turnOffStrip = (start = 0, end = NUM_LEDS) => {
		turnOnStrip('#000', start, end);
	};

	// Just like DOM-ready for web developers
	strip.on('ready', function () {
		// Turn off the entire strip
		turnOffStrip();
	});

	// Turn the Led on or off and update the state
	function toggleStrips(state, id) {
		console.log(`State: ${state}`);

		if (state == 0) {
			turnOffStrip();

			randomColor1 = getRandomColor();
			randomColor2 = getRandomColor(randomColor1);
		} else if (state == 1) {
			turnOnStrip(randomColor1, 0, NUM_LED_SEPARATE);
			turnOffStrip(NUM_LED_SEPARATE, NUM_LEDS);
		} else if (state >= 2) {
			turnOnStrip(randomColor1, 0, NUM_LED_SEPARATE);
			turnOnStrip(randomColor2, NUM_LED_SEPARATE, NUM_LEDS);
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
const startServer = (port = 3000) => {
	server.listen(port, '0.0.0.0', () => {
		console.log(`Listening at https://${hostname}:${port}`);
		if (localIP) console.log(`On Network at http://${localIP}:${port}`);
	});
};

startServer();
