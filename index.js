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
const ledsFrontDoor = [0, 52];
const ledsBackDoor = [53, 120];

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

const TRUNK_TIMEOUT = 15 * 1000;

let frontDoor = null;
let trunk = null;
let strip = null;
let colors = ['#8F8', '#F66'];

let savedState = 0;
let index = 0;

const board = new five.Board({ repl: false });
board.on('ready', function () {
	// Define our hardware
	frontDoor = new five.Servo({
		pin: 3,
		range: [0, 180],
		startAt: 0,
	});
	trunk = new five.Motor({
		controller: 'GROVE_I2C_MOTOR_DRIVER',
		pin: 'A',
	});

	strip = new pixel.Strip({
		board: this,
		controller: 'FIRMATA',
		strips: [{ pin: 6, length: NUM_LEDS }],
		gamma: 2.8,
	});

	trunk.on('forward', async () => {
		await scheduler.wait(TRUNK_TIMEOUT);
		trunk.stop();
	});

	trunk.on('reverse', async () => {
		await scheduler.wait(TRUNK_TIMEOUT);
		trunk.stop();
	});

	const turnOnDoor = async (door) => {
		let begin, end;
		switch (door) {
			case 'f':
				[begin, end] = ledsFrontDoor;
				turnOnStrip(begin, end, '#FFF');
				break;
			case 'b':
				[begin, end] = ledsBackDoor;
				turnOnStrip(begin, end, '#FFF');
				break;
			case 't':
				break;
		}
	};

	const turnOnStrip = async (
		begin = 0,
		end = NUM_LEDS,
		color = '#FFF',
		delay = 10
	) => {
		for (index = 0; index < NUM_LEDS; index++) {
			if (index >= begin && index <= end) {
				strip.pixel(index).color(color);
				strip.show();

				await scheduler.wait(delay);
			} else {
				strip.pixel(index).color('#000');
				strip.show();
			}
		}
	};
	const turnOffStrip = () => {
		strip.color('#000');
		strip.show();
	};

	strip.on('ready', function () {
		console.log("Strip ready, let's go");
	});

	// Turn the Led on or off and update the state
	async function openDoor(door, id) {
		console.log(`Open door: ${door}`);

		turnOffStrip();
		turnOnDoor(door);
		await scheduler.wait(1000);

		switch (door) {
			case 'f':
				frontDoor.to(180);
				break;
			case 'b':
				break;
			case 't':
				trunk.fwd(255);
				break;
		}
	}

	async function closeDoor(door, id) {
		console.log(`Close door: ${door}`);

		turnOffStrip();
		await scheduler.wait(1000);

		switch (door) {
			case 'f':
				frontDoor.to(0);
				break;
			case 'b':
				break;
			case 't':
				trunk.rev(255);
				break;
		}
	}

	// Send a welcome to the user
	async function sendWelcome(id) {
		console.log(`Welcome`);
		turnOnStrip();

		await scheduler.wait(5000);
		turnOffStrip();
	}

	io.on('connection', (socket) => {
		const { id } = socket.handshake.query;
		console.log(`Connection: ${id}`);

		// Add subscriber for each new connection
		subscribe(id, socket);

		// Listener for event
		socket.on('send-open-door', (door) => {
			openDoor(door, id);
		});

		socket.on('send-close-door', (door) => {
			closeDoor(door, id);
		});

		socket.on('send-welcome', () => {
			sendWelcome(id);
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
