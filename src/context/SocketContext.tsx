'use client';
import { getSocket } from '@/libs/socket';
import { createContext, useContext, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
	const [socket] = useState<Socket>(() => getSocket());

	useEffect(() => {
		socket.connect();

		return () => {
			socket.disconnect();
		};
	}, [socket]);

	return (
		<SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
	);
}

export const useSocket = () => useContext(SocketContext);
