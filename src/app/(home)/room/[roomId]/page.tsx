'use client';

import { useSocket } from '@/context/SocketContext';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RoomPage() {
	const params = useParams();
	if (!params.roomId) {
		notFound();
	}

	const [showToast, setShowToast] = useState(false);

	const socket = useSocket();
	const router = useRouter();

	const leaveRoom = () => {
		socket?.emit(
			'leave-room',
			(response: { success: boolean; error?: string }) => {
				console.error('Клик');
				if (response.success) {
					console.error('Пытаюсь выйти');
					router.push('/');
				} else {
					console.error('Failed to leave room:', response.error);
				}
			},
		);
	};

	const copyRoomLink = () => {
		const link = `${window.location.origin}/room/${params.roomId}`;
		if (params.roomId) {
			navigator.clipboard
				.writeText(link)
				.then(() => {
					setShowToast(true);
					setTimeout(() => setShowToast(false), 2000);
				})
				.catch(e => {
					console.log(e);
				});
		}
	};

	const copyRoomAddress = () => {
		if (params.roomId && typeof params.roomId === 'string') {
			navigator.clipboard.writeText(params.roomId).catch(e => {
				console.log(e);
			});
		}
	};

	return (
		<div className='h-screen bg-gray-900 flex flex-col'>
			{/* Toast уведомление */}
			{showToast && (
				<div className='fixed top-4 right-4 z-50 animate-slide-in'>
					<div className='bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2'>
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
								d='M5 13l4 4L19 7'
							/>
						</svg>
						<span className='font-medium'>Ссылка скопирована!</span>
					</div>
				</div>
			)}

			{/* Header */}
			<div className='bg-gray-800 border-b border-gray-700 px-6 py-4'>
				<div className='flex items-center justify-between'>
					<div>
						<h1 className='text-xl font-semibold text-white'>Комната</h1>
						<p
							className='text-sm text-gray-400 font-mono cursor-pointer'
							onClick={copyRoomAddress}
						>
							{params.roomId as string}
						</p>
					</div>
					<div className='flex items-center gap-3'>
						<span className='text-sm text-gray-400'>
							<span className='inline-block w-2 h-2 bg-green-500 rounded-full mr-2'></span>
							3 участника
						</span>
						<button
							className='text-gray-400 hover:text-white transition-colors'
							onClick={copyRoomLink}
						>
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
									d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
								/>
							</svg>
						</button>
					</div>
				</div>
			</div>

			{/* Video Grid */}
			<div className='flex-1 p-4 overflow-auto'>
				<div className='grid grid-cols-2 gap-4 h-full'>
					{/* Local Video */}
					<div className='relative bg-gray-800 rounded-lg overflow-hidden shadow-lg'>
						<video className='w-full h-full object-cover' autoPlay muted />
						<div className='absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded-full'>
							<span className='text-white text-sm font-medium'>Вы</span>
						</div>
						<div className='absolute top-3 right-3 flex gap-2'>
							<div className='bg-red-500 p-2 rounded-full'>
								<svg
									className='w-4 h-4 text-white'
									fill='none'
									stroke='currentColor'
									viewBox='0 0 24 24'
								>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										strokeWidth={2}
										d='M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z'
									/>
								</svg>
							</div>
						</div>
					</div>

					{/* Remote Video 1 */}
					<div className='relative bg-gray-800 rounded-lg overflow-hidden shadow-lg'>
						<video className='w-full h-full object-cover' autoPlay />
						<div className='absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded-full'>
							<span className='text-white text-sm font-medium'>Участник 1</span>
						</div>
					</div>

					{/* Remote Video 2 */}
					<div className='relative bg-gray-800 rounded-lg overflow-hidden shadow-lg'>
						<video className='w-full h-full object-cover' autoPlay />
						<div className='absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded-full'>
							<span className='text-white text-sm font-medium'>Участник 2</span>
						</div>
					</div>

					{/* Empty Slot */}
					<div className='relative bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center'>
						<div className='text-center'>
							<svg
								className='w-12 h-12 text-gray-600 mx-auto mb-2'
								fill='none'
								stroke='currentColor'
								viewBox='0 0 24 24'
							>
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									strokeWidth={2}
									d='M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z'
								/>
							</svg>
							<p className='text-gray-500 text-sm'>Ожидание участника</p>
						</div>
					</div>
				</div>
			</div>

			{/* Controls */}
			<div className='bg-gray-800 border-t border-gray-700 px-6 py-4'>
				<div className='flex items-center justify-center gap-4'>
					{/* Microphone */}
					<button className='bg-gray-700 hover:bg-gray-600 p-4 rounded-full transition-colors'>
						<svg
							className='w-6 h-6 text-white'
							fill='none'
							stroke='currentColor'
							viewBox='0 0 24 24'
						>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth={2}
								d='M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z'
							/>
						</svg>
					</button>

					{/* Camera */}
					<button className='bg-gray-700 hover:bg-gray-600 p-4 rounded-full transition-colors'>
						<svg
							className='w-6 h-6 text-white'
							fill='none'
							stroke='currentColor'
							viewBox='0 0 24 24'
						>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth={2}
								d='M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
							/>
						</svg>
					</button>

					{/* Screen Share */}
					<button className='bg-gray-700 hover:bg-gray-600 p-4 rounded-full transition-colors'>
						<svg
							className='w-6 h-6 text-white'
							fill='none'
							stroke='currentColor'
							viewBox='0 0 24 24'
						>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth={2}
								d='M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
							/>
						</svg>
					</button>

					{/* Chat */}
					<button className='bg-gray-700 hover:bg-gray-600 p-4 rounded-full transition-colors relative'>
						<svg
							className='w-6 h-6 text-white'
							fill='none'
							stroke='currentColor'
							viewBox='0 0 24 24'
						>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth={2}
								d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
							/>
						</svg>
						<span className='absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center'>
							3
						</span>
					</button>

					<div className='w-px h-10 bg-gray-700 mx-2'></div>

					{/* Leave */}
					<button
						className='bg-red-600 hover:bg-red-700 p-4 rounded-full transition-colors'
						onClick={leaveRoom}
					>
						<svg
							className='w-6 h-6 text-white'
							fill='none'
							stroke='currentColor'
							viewBox='0 0 24 24'
						>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth={2}
								d='M6 18L18 6M6 6l12 12'
							/>
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
}
