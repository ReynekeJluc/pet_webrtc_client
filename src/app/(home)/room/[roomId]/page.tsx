'use client';

import { useSocket } from '@/context/SocketContext';
import {
	notFound,
	useParams,
	useRouter,
	useSearchParams,
} from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function RoomPage() {
	const searchParams = useSearchParams();
	const params = useParams();

	const nickname = searchParams.get('nickname') || 'Анонимус';
	const roomId = Array.isArray(params.roomId)
		? params.roomId[0]
		: params.roomId;
	if (!params.roomId) {
		notFound();
	}

	const [isMicrophone, setIsMicrophone] = useState(true);
	const [isCamera, setIsCamera] = useState(true);
	const [isShareDisplay, setIsShareDisplay] = useState(false);

	const [showToast, setShowToast] = useState(false);
	const [localStream, setlocalStream] = useState<MediaStream | null>(null);
	const [peers, setPeers] = useState(
		new Map<
			string,
			{
				nickname: string;
				connection: RTCPeerConnection;
				stream: MediaStream | null;
			}
		>(),
	); // вынести в тип

	const videoRef = useRef<HTMLVideoElement>(null);

	const socket = useSocket();
	const router = useRouter();

	// запрашиваем разрешения
	const requestPermissions = async () => {
		const mediaStream = await navigator.mediaDevices.getUserMedia({
			video: true,
			audio: true,
		});

		return mediaStream;
	};

	// создаем пир подключение
	const createPeerConnection = (
		data: {
			nickname: string;
			socketId: string;
		},
		stream: MediaStream,
	) => {
		if (!socket) return;
		const pc = new RTCPeerConnection({
			iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
		});

		// логи состояния
		pc.onconnectionstatechange = () => {
			console.log('connectionState', data.socketId, pc.connectionState);
		};

		pc.oniceconnectionstatechange = () => {
			console.log('iceConnectionState', data.socketId, pc.iceConnectionState);
		};
		//

		pc.onicecandidate = event => {
			if (event.candidate !== null) {
				socket.emit('relay-ice', {
					targetSocketId: data.socketId,
					candidate: event.candidate,
				});
			}
		};

		pc.ontrack = event => {
			setPeers(prevPeers => {
				const peer = prevPeers.get(data.socketId);
				if (peer) {
					peer.stream = event.streams[0];
				}
				return new Map(prevPeers);
			});
		};

		stream.getTracks().forEach(track => {
			pc.addTrack(track, stream);
		});

		return pc;
	};

	// Логика уже подключенных
	const handlePeerJoined = (
		data: {
			socketId: string;
			nickname: string;
		},
		stream: MediaStream,
	) => {
		if (!socket) return;

		const pc = createPeerConnection(data, stream);
		if (pc) {
			setPeers(prevPeers => {
				const newPeer = new Map(prevPeers);
				newPeer.set(data.socketId, {
					nickname: data.nickname,
					connection: pc,
					stream: null,
				});
				return newPeer;
			});

			pc.createOffer()
				.then((offer: RTCSessionDescriptionInit) => {
					pc.setLocalDescription(offer);

					socket.emit('relay-sdp', {
						targetSocketId: data.socketId,
						sdp: offer,
					});

					console.log('Создан offer для:', data.socketId);
				})
				.catch(e => {
					console.error('Ошибка отправки SDP', e);
				});
		}
	};

	// Логика подключающихся
	const handleExistingParticipants = (
		data: {
			participants: Array<{
				socketId: string;
				nickname: string;
			}>;
		},
		stream: MediaStream,
	) => {
		if (!socket) return;
		console.log('Уже в комнате:', data.participants);

		setPeers(prevPeers => {
			const newPeers = new Map(prevPeers);

			data.participants.forEach(participant => {
				const { socketId, nickname } = participant;

				const pc = createPeerConnection({ nickname, socketId }, stream);
				if (pc) {
					newPeers.set(socketId, {
						nickname: nickname,
						connection: pc,
						stream: null,
					});
				}
			});

			return newPeers;
		});
	};

	// Обработка получения SDP offer
	const handleSdpReceived = (data: {
		fromSocketId: string;
		sdp: RTCSessionDescriptionInit;
	}) => {
		if (!socket) return;
		console.log('Получен SDP от:', data.fromSocketId);

		setPeers(prevPeers => {
			const newPeers = new Map(prevPeers);
			const peer = newPeers.get(data.fromSocketId);

			if (peer) {
				peer.connection
					.setRemoteDescription(data.sdp)
					.then(() => {
						if (data.sdp.type === 'offer') {
							return peer.connection.createAnswer();
						}
					})
					.then((answer?: RTCSessionDescriptionInit) => {
						if (answer) {
							peer.connection.setLocalDescription(answer);

							socket.emit('relay-sdp', {
								targetSocketId: data.fromSocketId,
								sdp: answer,
							});
						}
					})
					.catch((e: Error) => {
						console.error('Ошибка обработки SDP:', e);
					});
			} else {
				console.error('Peer не найден id = ', data.fromSocketId);
			}
			return newPeers;
		});
	};

	// Получение ICE candidate
	const handleIceReceived = (data: {
		fromSocketId: string;
		candidate: RTCIceCandidateInit;
	}) => {
		if (!socket) return;

		console.log('Получен ICE от:', data.fromSocketId);

		setPeers(prevPeers => {
			const peer = prevPeers.get(data.fromSocketId);
			if (peer) {
				peer.connection.addIceCandidate(data.candidate).catch((e: Error) => {
					console.error('Ошибка ICE: ', e);
				});
			} else {
				console.error('Peer не найден id = ', data.fromSocketId);
			}

			return prevPeers;
		});
	};

	// Обработка выхода участника
	const handlePeerDisconnect = (socketId: string) => {
		if (!socket) return;
		console.log('Участник вышел:', socketId);

		setPeers(prevPeers => {
			const newPeers = new Map(prevPeers);

			const peer = newPeers.get(socketId);
			if (peer) {
				peer.connection.close();
			}
			newPeers.delete(socketId);

			return newPeers;
		});
	};

	const joinRoom = () => {
		socket?.emit(
			'join-room',
			{
				roomId: roomId,
				nickname: nickname,
			},
			(response: { success: boolean; error?: string }) => {
				if (!response.success) {
					alert('Не удалось войти в комнату');
					console.error(response.error);
					router.push('/');
				} else {
					console.log('Успешный вход');
				}
			},
		);
	};

	const checkRoom = async () => {
		return new Promise(resolve => {
			socket?.emit('check-room', { roomId }, (res: { success: boolean }) => {
				if (res.success) {
					resolve(true);
				} else {
					resolve(false);
				}
			});
		});
	};

	// Точка входа
	const startRoomSession = async () => {
		if (!socket) return null;

		// проверка комнаты
		const isJoin = await checkRoom();
		if (isJoin) {
			// разрешения
			const stream = await requestPermissions();
			setlocalStream(stream);

			if (videoRef.current) {
				videoRef.current.srcObject = stream;
			}

			return stream;
		}
		return null;
	};

	useEffect(() => {
		if (!socket) return;

		const localVideo = videoRef.current;
		let stream: MediaStream | null = null;

		const onPeerJoined = (data: { socketId: string; nickname: string }) => {
			if (stream) {
				handlePeerJoined(data, stream);
			}
		};

		const onExistingParticipants = (data: {
			participants: Array<{
				socketId: string;
				nickname: string;
			}>;
		}) => {
			if (stream) {
				handleExistingParticipants(data, stream);
			}
		};

		const start = async () => {
			stream = await startRoomSession();

			if (stream) {
				// подписки
				socket.on('peer-joined', onPeerJoined);
				socket.on('existing-participants', onExistingParticipants);
				socket.on('sdp-received', handleSdpReceived);
				socket.on('ice-received', handleIceReceived);
				socket.on('peer-disconnected', handlePeerDisconnect);

				joinRoom();
			}
		};
		start();

		return () => {
			socket.off('peer-joined', onPeerJoined);
			socket.off('existing-participants', onExistingParticipants);
			socket.off('sdp-received', handleSdpReceived);
			socket.off('ice-received', handleIceReceived);
			socket.off('peer-disconnected', handlePeerDisconnect);

			peers.forEach(peer => {
				peer.connection.close();
				peer.stream = null;
			});

			if (localStream) {
				localStream.getTracks().forEach(track => {
					track.stop();
				});
				if (localVideo) {
					localVideo.srcObject = null;
				}
			}
		};
	}, [socket, roomId, nickname, peers, localStream]);

	// Логи пиров
	useEffect(() => {
		console.log('Peers обновились:', peers);
	}, [peers]);

	//
	// Локальные функции
	//

	// Константы
	const MAX_PARTICIPANTS = 4;
	const totalParticipants = peers.size + 1;
	const emptySlots = MAX_PARTICIPANTS - totalParticipants;

	// обработчик клика на кнопку копирования ссылки румы
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

	// обработчик клика на кнопку выхода
	const leaveRoom = () => {
		if (localStream) {
			localStream.getTracks().forEach(track => track.stop());
			setlocalStream(null);
		}

		socket?.emit(
			'leave-room',
			(response: { success: boolean; error?: string }) => {
				if (response.success) {
					router.push('/');
				} else {
					console.error('Failed to leave room:', response.error);
				}
			},
		);
	};

	// обработчик клика на имя румы (убрать на проде)
	const copyRoomAddress = () => {
		if (params.roomId && typeof params.roomId === 'string') {
			navigator.clipboard.writeText(params.roomId).catch(e => {
				console.log(e);
			});
		}
	};

	// toggle микрофона
	const switchMicrophone = () => {
		if (
			localStream &&
			localStream.getAudioTracks()[0] &&
			localStream.getAudioTracks()[0].readyState === 'live'
		) {
			const audio = localStream.getAudioTracks()[0];
			audio.enabled = !audio.enabled;
			setIsMicrophone(audio.enabled);
		} else {
			requestAudio();
		}
	};

	// toggle камеры
	const switchCamera = () => {
		if (
			localStream &&
			localStream.getVideoTracks()[0] &&
			localStream.getVideoTracks()[0].readyState === 'live'
		) {
			const video = localStream.getVideoTracks()[0];
			video.enabled = !video.enabled;
			setIsCamera(video.enabled);
		} else {
			requestVideo();
		}
	};
	// 	navigator.mediaDevices
	// 		.getUserMedia({ video: true, audio: true })
	// 		.then(mediaStream => {
	// 			const newAudio = mediaStream.getAudioTracks()[0];
	// 			const newVideo = mediaStream.getVideoTracks()[0];

	// 			if (localStream) {
	// 				const oldAudio = localStream.getAudioTracks()[0];
	// 				const oldVideo = localStream.getVideoTracks()[0];

	// 				if (oldAudio) {
	// 					localStream.removeTrack(oldAudio);
	// 					oldAudio.stop();
	// 				}
	// 				if (oldVideo) {
	// 					localStream.removeTrack(oldVideo);
	// 					oldVideo.stop();
	// 				}

	// 				localStream.addTrack(newAudio);
	// 				localStream.addTrack(newVideo);
	// 			}

	// 			peers.forEach(peer => {
	// 				const senders = peer.connection.getSenders();
	// 				const audioSender = senders.find(
	// 					(s: RTCRtpSender) => s.track?.kind === 'audio',
	// 				);
	// 				const videoSender = senders.find(
	// 					(s: RTCRtpSender) => s.track?.kind === 'video',
	// 				);
	// 				if (audioSender) {
	// 					audioSender.replaceTrack(newAudio);
	// 				}
	// 				if (videoSender) {
	// 					videoSender.replaceTrack(newVideo);
	// 				}
	// 			});

	// 			// setIsMicrophone(true);
	// 			// setIsCamera(true);
	// 		})
	// 		.catch(e => {
	// 			console.error('Failed to get media:', e);
	// 			alert('Не удалось получить доступ к микрофону и камере');

	// 			requestAudio();
	// 		});
	// };

	// Запрос разрешения на видео
	const requestVideo = () => {
		navigator.mediaDevices
			.getUserMedia({ video: true })
			.then(videoStream => {
				const newVideo = videoStream.getVideoTracks()[0];

				if (localStream) {
					const oldVideo = localStream.getVideoTracks()[0];
					if (oldVideo) {
						localStream.removeTrack(oldVideo);
						oldVideo.stop();
					}
					localStream.addTrack(newVideo);

					if (videoRef.current) {
						videoRef.current.srcObject = localStream;
					}
				} else {
					const newStream = new MediaStream([newVideo]);
					setlocalStream(newStream);

					if (videoRef.current) {
						videoRef.current.srcObject = newStream;
					}
				}

				peers.forEach(peer => {
					const senders = peer.connection.getSenders();
					const videoSender = senders.find(
						(s: RTCRtpSender) => s.track?.kind === 'video',
					);
					if (videoSender) {
						videoSender.replaceTrack(newVideo);
					}
				});

				setIsCamera(true);
			})
			.catch(e => {
				console.error('Failed to get video:', e);
				alert('Не удалось получить доступ к камере');
			});
	};

	// Запрос разрешения на микрофон
	const requestAudio = () => {
		navigator.mediaDevices
			.getUserMedia({ audio: true })
			.then(audioStream => {
				const newAudio = audioStream.getAudioTracks()[0];
				if (localStream) {
					const oldAudio = localStream.getAudioTracks()[0];
					if (oldAudio) {
						localStream.removeTrack(oldAudio);
						oldAudio.stop();
					}
					localStream.addTrack(newAudio);

					if (videoRef.current) {
						videoRef.current.srcObject = localStream;
					}
				} else {
					const newStream = new MediaStream([newAudio]);
					setlocalStream(newStream);

					if (videoRef.current) {
						videoRef.current.srcObject = newStream;
					}
				}

				peers.forEach(peer => {
					const senders = peer.connection.getSenders();
					const audioSender = senders.find(
						(s: RTCRtpSender) => s.track?.kind === 'audio',
					);
					if (audioSender) {
						audioSender.replaceTrack(newAudio);
					}
				});

				setIsMicrophone(true);
			})
			.catch(e => {
				console.error('Failed to get media:', e);
				alert('Не удалось получить доступ к микрофону');
			});
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
							{totalParticipants} участник(-а, -ов)
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
						<video
							ref={videoRef}
							className='w-full h-full object-cover'
							autoPlay
							muted
						/>
						<div className='absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded-full'>
							<span className='text-white text-sm font-medium'>{nickname}</span>
						</div>
						{isMicrophone ? (
							<div className='absolute top-3 right-3 flex gap-2'>
								<div className='bg-green-500 p-2 rounded-full'>
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
						) : (
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
						)}
					</div>

					{Array.from(peers).map(([socketId, peer]) => (
						<div
							key={socketId}
							className='relative bg-gray-800 rounded-lg overflow-hidden shadow-lg'
						>
							<video
								ref={ref => {
									if (ref && peer.stream) {
										ref.srcObject = peer.stream;
									}
								}}
								className='w-full h-full object-cover'
								playsInline
								autoPlay
							/>
							<div className='absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded-full'>
								<span className='text-white text-sm font-medium'>
									{peer.nickname}
								</span>
							</div>
						</div>
					))}

					{Array.from({ length: emptySlots }).map((_, index) => (
						<div
							key={index}
							className='relative bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center'
						>
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
					))}
				</div>
			</div>

			{/* Controls */}
			<div className='bg-gray-800 border-t border-gray-700 px-6 py-4'>
				<div className='flex items-center justify-center gap-4'>
					{/* Microphone */}
					<button
						onClick={() => switchMicrophone()}
						className={`${isMicrophone ? 'bg-green-700 hover:bg-green-600' : 'bg-red-600 hover:bg-red-700'} p-4 rounded-full transition-colors`}
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
								d='M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z'
							/>
							{!isMicrophone && (
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									strokeWidth={2}
									d='M6 6l12 12'
								/>
							)}
						</svg>
					</button>

					{/* Camera */}
					<button
						onClick={() => switchCamera()}
						className={`${isCamera ? 'bg-green-700 hover:bg-green-600' : 'bg-red-600 hover:bg-red-700'} p-4 rounded-full transition-colors`}
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
								d='M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
							/>
							{!isCamera && (
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									strokeWidth={2}
									d='M6 6l12 12'
								/>
							)}
						</svg>
					</button>

					{/* Screen Share */}
					<button
						onClick={() => setIsShareDisplay(!isShareDisplay)}
						className={`${isShareDisplay ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'} p-4 rounded-full transition-colors`}
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
								d='M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
							/>
							{isShareDisplay && (
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									strokeWidth={2}
									d='M6 6l12 12'
								/>
							)}
						</svg>
					</button>

					{/* Chat */}
					{/* <button className='bg-gray-700 hover:bg-gray-600 p-4 rounded-full transition-colors relative'>
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
					</button> */}

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
