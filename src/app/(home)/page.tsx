'use client';

import { useSocket } from '@/context/SocketContext';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Home() {
	const [inputValue, setInputValue] = useState('');

	const socket = useSocket();
	const router = useRouter();

	const createRoom = () => {
		socket?.emit(
			'create-room',
			(response: { success: boolean; roomId?: string; error?: string }) => {
				if (response.success) {
					router.push(`room/${response.roomId}`);
				} else {
					console.error('Failed to create room:', response.error);
				}
			},
		);
	};

	const joinRoom = (roomId: string) => {
		if (!roomId.trim()) {
			alert('Введите Room ID');
			return;
		}
		router.push(`room/${roomId}`);
	};

	return (
		<div>
			<button onClick={createRoom}>Создать комнату</button>
			<input
				placeholder='Room ID'
				value={inputValue}
				onChange={e => setInputValue(e.target.value)}
			/>
			<button onClick={() => joinRoom(inputValue)}>Войти</button>
		</div>
	);
}
