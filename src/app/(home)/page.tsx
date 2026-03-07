'use client';

import { useSocket } from '@/context/SocketContext';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Home() {
	const [inputValue, setInputValue] = useState('');
	const [nickValue, setNickValue] = useState('');

	const socket = useSocket();
	const router = useRouter();

	const createRoom = () => {
		socket?.emit(
			'create-room',
			(response: { success: boolean; roomId?: string; error?: string }) => {
				if (response.success) {
					router.push(`/room/${response.roomId}?nickname=${nickValue}`);
				} else {
					console.error('Failed to create room:', response.error);
				}
			},
		);
	};

	const joinRoom = (roomId: string) => {
		if (!roomId.trim()) {
			alert('Введите Id комнаты'); //! Сделай всплывашку вместо этого колхоза
			return;
		}

		socket?.emit('check-room', { roomId }, (res: { success: boolean }) => {
			if (res.success) {
				router.push(`/room/${roomId}?nickname=${nickValue}`);
			} else {
				alert('Комната не найдена'); //! Сделай всплывашку вместо этого колхоза
			}
		});
	};

	return (
		<div className='min-h-screen bg-gray-900 flex items-center justify-center p-4'>
			<div className='bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-md border border-gray-700'>
				<div className='text-center mb-8'>
					<h1 className='text-3xl font-bold text-white mb-2'>
						WebRTC Video Chat
					</h1>
					<p className='text-gray-400'>
						Создайте комнату или присоединитесь к существующей
					</p>
				</div>

				{/* Никнейм - один раз вверху */}
				<div className='mb-6'>
					<label className='block text-sm font-medium text-gray-300 mb-2'>
						Ваш никнейм
					</label>
					<input
						type='text'
						placeholder='Введите никнейм'
						value={nickValue}
						onChange={e => setNickValue(e.target.value)}
						className='w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder-gray-400'
					/>
				</div>

				{/* Создать комнату */}
				<div className='mb-6'>
					<button
						onClick={createRoom}
						// disabled={!nickValue.trim()}
						className='w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg'
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
						<div className='w-full border-t border-gray-700'></div>
					</div>
					<div className='relative flex justify-center text-sm'>
						<span className='px-4 bg-gray-800 text-gray-400'>или</span>
					</div>
				</div>

				{/* Войти в комнату */}
				<div>
					<label className='block text-sm font-medium text-gray-300 mb-2'>
						Код комнаты
					</label>
					<div className='flex gap-2'>
						<input
							type='text'
							placeholder='Введите ID комнаты'
							value={inputValue}
							onChange={e => setInputValue(e.target.value)}
							onKeyDown={e => e.key === 'Enter' && joinRoom(inputValue)}
							className='flex-1 px-4 py-3 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder-gray-400'
						/>
						<button
							onClick={() => joinRoom(inputValue)}
							// disabled={!inputValue.trim() || !nickValue.trim()}
							className='bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200'
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
