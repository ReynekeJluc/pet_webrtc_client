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
		<div className='min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4'>
			<div className='bg-white rounded-2xl shadow-xl p-8 w-full max-w-md'>
				<div className='text-center mb-8'>
					<h1 className='text-3xl font-bold text-gray-800 mb-2'>
						WebRTC Video Chat
					</h1>
					<p className='text-gray-600'>
						Создайте комнату или присоединитесь к существующей
					</p>
				</div>

				{/* Создать комнату */}
				<div className='mb-6'>
					<button
						onClick={createRoom}
						className='w-full bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5'
					>
						<span className='flex items-center justify-center gap-2'>
							<svg
								className='w-5 h-5'
								fill='none'
								stroke='currentColor'
								viewBox='0 0 24 24'
							>
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									strokeWidth={2}
									d='M12 4v16m8-8H4'
								/>
							</svg>
							Создать новую комнату
						</span>
					</button>
				</div>

				{/* Разделитель */}
				<div className='relative mb-6'>
					<div className='absolute inset-0 flex items-center'>
						<div className='w-full border-t border-gray-300'></div>
					</div>
					<div className='relative flex justify-center text-sm'>
						<span className='px-4 bg-white text-gray-500'>или</span>
					</div>
				</div>

				{/* Войти в комнату */}
				<div>
					<label className='block text-sm font-medium text-gray-700 mb-2'>
						Код комнаты
					</label>
					<div className='flex gap-2'>
						<input
							type='text'
							placeholder='Введите ID комнаты'
							value={inputValue}
							onChange={e => setInputValue(e.target.value)}
							onKeyDown={e => e.key === 'Enter' && joinRoom(inputValue)}
							className='flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all'
						/>
						<button
							onClick={() => joinRoom(inputValue)}
							disabled={!inputValue.trim()}
							className='bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg'
						>
							Войти
						</button>
					</div>
				</div>

				{/* Footer */}
				<div className='mt-8 text-center text-xs text-gray-500'>
					<p>До 4 участников • P2P соединение</p>
				</div>
			</div>
		</div>
	);
}
