import express from 'express';
import http from 'http';
import * as socketIo from 'socket.io';
import cors from 'cors';

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new socketIo.Server(server);

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

// Notify all subscribers of message
function emitMessage(data) {
	console.log(
		`emitMessage: ${data.state}, Subscribers: ${subscribers.size}, Sender: ${data.id}`
	);
	subscribers.forEach((socket, id) => {
		if (id !== data.id) socket.emit('receive-message', data.message);
	});
}

// Runs when each client connects to the socket server
io.on('connection', (socket) => {
	console.log('Connection');
	const { id } = socket.handshake.query;

	// Add subscriber for each new connection
	subscribe(id, socket);

	socket.on('send-message', (message) => {
		emitMessage({ message, id });
	});

	// Clean up when client disconnects
	socket.on('disconnect', () => {
		unsubscribe(id);
	});
});

app.get('/', (req, res) => {
	res.send('Server is up and running');
});

app.get('/reset', (req, res) => {
	subscribers.clear();
	res.send('Reset subscribers');
});

app.get('/list', (req, res) => {
	console.log(Object.fromEntries(subscribers.entries()));
	res.end();
});

server.listen(PORT, () => {
	console.log(`Listening to ${PORT}`);
});
