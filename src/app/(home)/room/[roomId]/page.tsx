'use client';

import { useSocket } from '@/context/SocketContext';
import type { PeerType } from '@/types/PeerType';
import {
	notFound,
	useParams,
	useRouter,
	useSearchParams,
} from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import RemotePeerCard from './remotePeerCard';

type PeerConnectionEntry = {
	pc: RTCPeerConnection;
	audioSender: RTCRtpSender;
	videoSender: RTCRtpSender;
};

export default function RoomPage() {
	const searchParams = useSearchParams();
	const params = useParams();

	const nickname = searchParams.get('nickname') || 'Anonymous';
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
	const [peersState, setPeersState] = useState(new Map<string, PeerType>());

	const initializationRef = useRef<boolean>(false); // для dev режима, от strict mode
	const iceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
		new Map(),
	);
	const sdpOffersRef = useRef<Map<string, RTCSessionDescriptionInit[]>>(
		new Map(),
	);
	const peerConnectionsRef = useRef<Map<string, PeerConnectionEntry>>(
		new Map(),
	);
	const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
	const localStreamRef = useRef<MediaStream | null>(null);
	const videoRef = useRef<HTMLVideoElement>(null);

		const socket = useSocket();
		const router = useRouter();

		const syncLocalPreview = (stream: MediaStream | null) => {
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
			}
		};

		const ensurePeerState = (
			socketId: string,
			peerNickname: string,
			stream: MediaStream | null = null,
		) => {
			setPeersState(prevPeers => {
				const nextPeers = new Map(prevPeers);
				const existingPeer = nextPeers.get(socketId);

				nextPeers.set(socketId, {
					nickname: peerNickname,
					stream: stream ?? existingPeer?.stream ?? null,
				});

				return nextPeers;
			});
		};

	// запрашиваем разрешения
		const requestPermissions = async () => {
			if (!navigator.mediaDevices?.getUserMedia) {
				throw new Error('getUserMedia is unavailable');
			}

			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: true,
					audio: true,
				});

				console.log('local media ready', {
					audioTracks: stream.getAudioTracks().length,
					videoTracks: stream.getVideoTracks().length,
				});

				return stream;
			} catch (combinedError) {
				console.warn(
					'combined media request failed, trying partial access',
					combinedError,
				);

				const fallbackStream = new MediaStream();
				const [audioResult, videoResult] = await Promise.allSettled([
					navigator.mediaDevices.getUserMedia({ audio: true }),
					navigator.mediaDevices.getUserMedia({ video: true }),
				]);

				if (audioResult.status === 'fulfilled') {
					audioResult.value.getAudioTracks().forEach(track => {
						fallbackStream.addTrack(track);
					});
				} else {
					console.warn('audio permission unavailable', audioResult.reason);
				}

				if (videoResult.status === 'fulfilled') {
					videoResult.value.getVideoTracks().forEach(track => {
						fallbackStream.addTrack(track);
					});
				} else {
					console.warn('video permission unavailable', videoResult.reason);
				}

				console.log('local media fallback ready', {
					audioTracks: fallbackStream.getAudioTracks().length,
					videoTracks: fallbackStream.getVideoTracks().length,
				});

				return fallbackStream;
			}
		};

	// создаем пир подключение
		const replaceTrackForPeers = async (
			kind: 'audio' | 'video',
			track: MediaStreamTrack,
		) => {
			for (const [socketId, peerConnection] of peerConnectionsRef.current) {
				const sender =
					kind === 'audio'
						? peerConnection.audioSender
						: peerConnection.videoSender;

				console.log(`replacing ${kind} track`, {
					socketId,
					trackId: track.id,
				});

				try {
					await sender.replaceTrack(track);
				} catch (e) {
					console.error(`failed to replace ${kind} track`, {
						socketId,
						error: e,
					});
				}
			}
		};

		const createPeerConnection = (
			data: {
				nickname: string;
				socketId: string;
			},
			stream: MediaStream,
		) => {
			if (!socket) return null;
		console.log('creating peer connection', {
			socketId: data.socketId,
			nickname: data.nickname,
			localAudioTracks: stream.getAudioTracks().length,
			localVideoTracks: stream.getVideoTracks().length,
		});
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

		pc.onicegatheringstatechange = () => {
			console.log(
				'icegatheringstatechange',
				data.socketId,
				pc.iceGatheringState,
			);
		};
		//

		pc.onicecandidate = event => {
			console.log('ice candidate has arrived');

			if (event.candidate !== null) {
				// console.log(`fromSocketId = ${socket.id}`);
				// console.log(`toSocketId = ${data.socketId}`);
				// console.log(`ice candidate = ${event.candidate.candidate}`);
				// console.log(`ice candidate sdpmid = ${event.candidate.sdpMid}`);

				socket.emit('relay-ice', {
					targetSocketId: data.socketId,
					candidate: event.candidate,
				});
			}
		};

			pc.ontrack = event => {
				console.log('received remote track', {
					socketId: data.socketId,
					trackKind: event.track.kind,
					streamsLength: event.streams.length,
					audioTracks: event.streams[0]?.getAudioTracks().length ?? 0,
					videoTracks: event.streams[0]?.getVideoTracks().length ?? 0,
				});

				let remoteStream = remoteStreamsRef.current.get(data.socketId);
				if (!remoteStream) {
					remoteStream = event.streams[0] ?? new MediaStream();
					remoteStreamsRef.current.set(data.socketId, remoteStream);
				}

				if (!remoteStream.getTracks().some(track => track.id === event.track.id)) {
					remoteStream.addTrack(event.track);
				}

				ensurePeerState(data.socketId, data.nickname, remoteStream);
			};

		const audioTrack = stream.getAudioTracks()[0];
		const videoTrack = stream.getVideoTracks()[0];

			if (audioTrack) {
				console.log('adding local audio track', {
					socketId: data.socketId,
					trackId: audioTrack.id,
					enabled: audioTrack.enabled,
					readyState: audioTrack.readyState,
				});
			} else {
				console.log('creating audio transceiver', {
					socketId: data.socketId,
				});
			}
			const audioTransceiver = audioTrack
				? pc.addTransceiver(audioTrack, {
						direction: 'sendrecv',
						streams: [stream],
					})
				: pc.addTransceiver('audio', { direction: 'sendrecv' });

			if (videoTrack) {
				console.log('adding local video track', {
					socketId: data.socketId,
					trackId: videoTrack.id,
					enabled: videoTrack.enabled,
					readyState: videoTrack.readyState,
				});
			} else {
				console.log('creating video transceiver', {
					socketId: data.socketId,
				});
			}
			const videoTransceiver = videoTrack
				? pc.addTransceiver(videoTrack, {
						direction: 'sendrecv',
						streams: [stream],
					})
				: pc.addTransceiver('video', { direction: 'sendrecv' });

			return {
				pc,
				audioSender: audioTransceiver.sender,
				videoSender: videoTransceiver.sender,
			};
		};

	// Логика уже подключенных
	const handlePeerJoined = async (
		data: {
			socketId: string;
			nickname: string;
		},
		stream: MediaStream,
	) => {
		if (!socket) return;
		let isOffered = false;
		console.log('handling peer joined', {
			socketId: data.socketId,
			nickname: data.nickname,
		});

		if (!peerConnectionsRef.current.has(data.socketId)) {
			const peerConnection = createPeerConnection(data, stream);
			if (peerConnection) {
				peerConnectionsRef.current.set(data.socketId, peerConnection);
				ensurePeerState(data.socketId, data.nickname);
				const pc = peerConnection.pc;

					const offers = sdpOffersRef.current.get(data.socketId);
					if (offers) {
					console.log('flushing buffered sdp', {
						socketId: data.socketId,
						count: offers.length,
					});
					for (const offer of offers) {
						if (offer.type === 'offer') {
							isOffered = true;
						}
						console.log('applying buffered sdp', {
							socketId: data.socketId,
							type: offer.type,
						});
						await pc.setRemoteDescription(offer);
						if (offer.type === 'offer') {
							const answer = await pc.createAnswer();
							await pc.setLocalDescription(answer);

							socket.emit('relay-sdp', {
								targetSocketId: data.socketId,
								sdp: answer,
							});
						}
					}
				}

				const candidates = iceCandidatesRef.current.get(data.socketId);
				if (candidates) {
					console.log('flushing buffered ice', {
						socketId: data.socketId,
						count: candidates.length,
					});
					for (const candidate of candidates) {
						await pc.addIceCandidate(candidate);
					}
				}

					sdpOffersRef.current.delete(data.socketId);
					iceCandidatesRef.current.delete(data.socketId);

					if (!isOffered) {
						try {
						const offer = await pc.createOffer();
						await pc.setLocalDescription(offer);

						socket.emit('relay-sdp', {
							targetSocketId: data.socketId,
							sdp: offer,
						});

						console.log('Создан offer для:', data.socketId);
					} catch (e) {
						console.error('Ошибка отправки SDP', e);
					}
				}
			}
		} else {
			console.warn('peer connection is already there');
		}
	};

	// Логика подключающихся
	const handleExistingParticipants = async (
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
		console.log('handling existing participants', {
			count: data.participants.length,
		});

		for (const participant of data.participants) {
			const { socketId, nickname } = participant;

				if (!peerConnectionsRef.current.has(socketId)) {
					console.log('creating peer for existing participant', {
						socketId,
						nickname,
					});
					const peerConnection = createPeerConnection(
						{ nickname, socketId },
						stream,
					);
					if (peerConnection) {
						peerConnectionsRef.current.set(socketId, peerConnection);
						ensurePeerState(socketId, nickname);
						const pc = peerConnection.pc;

						const offers = sdpOffersRef.current.get(socketId);
						if (offers) {
						console.log('flushing buffered sdp', {
							socketId,
							count: offers.length,
						});
						for (const offer of offers) {
							console.log('applying buffered sdp', {
								socketId,
								type: offer.type,
							});
							await pc.setRemoteDescription(offer);

							if (offer.type === 'offer') {
								const answer = await pc.createAnswer();
								await pc.setLocalDescription(answer);

								socket.emit('relay-sdp', {
									targetSocketId: socketId,
									sdp: answer,
								});
							}
						}
					}

					const candidates = iceCandidatesRef.current.get(socketId);
					if (candidates) {
						console.log('flushing buffered ice', {
							socketId,
							count: candidates.length,
						});
						for (const candidate of candidates) {
							await pc.addIceCandidate(candidate);
						}
					}

					sdpOffersRef.current.delete(socketId);
					iceCandidatesRef.current.delete(socketId);
				}
				} else {
					console.warn('peer connection is already there');
				}
			}
		};

	// Обработка получения SDP offer
	const handleSdpReceived = (data: {
		fromSocketId: string;
		sdp: RTCSessionDescriptionInit;
	}) => {
		if (!socket) return;
		console.log('Получен SDP от:', data.fromSocketId);
		console.log('received sdp', {
			socketId: data.fromSocketId,
			type: data.sdp.type,
		});

			const pc = peerConnectionsRef.current.get(data.fromSocketId)?.pc;
		if (!pc) {
			console.error('Peer не найден id = ', data.fromSocketId);

			const existing = sdpOffersRef.current.get(data.fromSocketId) ?? [];
			sdpOffersRef.current.set(data.fromSocketId, [...existing, data.sdp]);
			console.log('buffering sdp', {
				socketId: data.fromSocketId,
				type: data.sdp.type,
				bufferedCount: existing.length + 1,
			});

			return;
		}

		pc.setRemoteDescription(data.sdp)
			.then(() => {
				console.log('remote description set', {
					socketId: data.fromSocketId,
					type: data.sdp.type,
					signalingState: pc.signalingState,
				});
				if (data.sdp.type === 'offer') {
					return pc.createAnswer();
				}
			})
			.then(async (answer?: RTCSessionDescriptionInit) => {
				if (answer) {
					await pc.setLocalDescription(answer);
					console.log('answer created', {
						socketId: data.fromSocketId,
						type: answer.type,
					});

					socket.emit('relay-sdp', {
						targetSocketId: data.fromSocketId,
						sdp: answer,
					});
				}

				const candidates = iceCandidatesRef.current.get(data.fromSocketId);
				if (candidates) {
					console.log('flushing buffered ice after sdp', {
						socketId: data.fromSocketId,
						count: candidates.length,
					});
					for (const candidate of candidates) {
						await pc.addIceCandidate(candidate).catch((e: Error) => {
							console.error('Ошибка ICE: ', e);
						});
					}
				}

				iceCandidatesRef.current.delete(data.fromSocketId);
			})
			.catch((e: Error) => {
				console.error('Ошибка обработки SDP:', e);
			});
	};

	// Получение ICE candidate
	const handleIceReceived = async (data: {
		fromSocketId: string;
		candidate: RTCIceCandidateInit;
	}) => {
		if (!socket) return;

		console.log('Получен ICE от:', data.fromSocketId);
		// console.log('Кандидат ICE:', data.candidate);
			console.log('received ice', {
				socketId: data.fromSocketId,
				hasRemoteDescription: !!peerConnectionsRef.current.get(data.fromSocketId)
					?.pc.remoteDescription,
			});

			const pc = peerConnectionsRef.current.get(data.fromSocketId)?.pc;
		if (!pc) {
			// console.warn('Peer не найден id = ', data.fromSocketId);

			const existing = iceCandidatesRef.current.get(data.fromSocketId) ?? [];
			iceCandidatesRef.current.set(data.fromSocketId, [
				...existing,
				data.candidate,
			]);
			console.log('buffering ice without peer', {
				socketId: data.fromSocketId,
				bufferedCount: existing.length + 1,
			});

			return;
		}

		if (pc.remoteDescription) {
			await pc.addIceCandidate(data.candidate).catch((e: Error) => {
				console.error('Ошибка ICE: ', e);
			});
			console.log('applied ice candidate', {
				socketId: data.fromSocketId,
				signalingState: pc.signalingState,
				iceConnectionState: pc.iceConnectionState,
			});
		} else {
			const existing = iceCandidatesRef.current.get(data.fromSocketId) ?? [];
			iceCandidatesRef.current.set(data.fromSocketId, [
				...existing,
				data.candidate,
			]);
			console.log('buffering ice before remote description', {
				socketId: data.fromSocketId,
				bufferedCount: existing.length + 1,
			});
		}
	};

	// Обработка выхода участника
	const handlePeerDisconnect = (socketId: string) => {
		console.log('Участник вышел:', socketId);

			const peerConnection = peerConnectionsRef.current.get(socketId);
				peerConnection?.pc.close();

				peerConnectionsRef.current.delete(socketId);
				remoteStreamsRef.current.delete(socketId);
				iceCandidatesRef.current.delete(socketId);
				sdpOffersRef.current.delete(socketId);
				setPeersState(prev => {
			const newMap = new Map(prev);
			newMap.delete(socketId);
			return newMap;
		});
	};

	const joinRoom = () => {
		console.log('joining room', {
			roomId,
			nickname,
		});
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
					console.log('joined room', {
						roomId,
						nickname,
					});
				}
			},
		);
	};

	const checkRoom = async (): Promise<boolean> => {
		console.log('checkRoom start', roomId);
		return new Promise(resolve => {
			socket?.emit('check-room', { roomId }, (res: { success: boolean }) => {
				console.log('checkRoom result', res);
				resolve(res.success);
			});
		});
	};

	// Точка входа
	const startRoomSession = async () => {
		if (!socket) return null;

		// проверка комнаты
		const isJoin = await checkRoom();
		console.log('after checkRoom', isJoin);
		if (isJoin) {
				try {
					const stream = await requestPermissions();
					console.log('after requestPermissions', stream);
					localStreamRef.current = stream;

					syncLocalPreview(stream);

				setIsMicrophone(!!stream.getAudioTracks()[0]);
				setIsCamera(!!stream.getVideoTracks()[0]);

				return stream;
			} catch (e) {
					console.warn('join without local media', e);

					const emptyStream = new MediaStream();
					localStreamRef.current = emptyStream;

					syncLocalPreview(emptyStream);

				setIsMicrophone(false);
				setIsCamera(false);

				return emptyStream;
			}
		}

		return null;
	};

	const cleanupRoomResources = () => {
			const localVideo = videoRef.current;
			const peerConnections = peerConnectionsRef.current;

			iceCandidatesRef.current.clear();
			sdpOffersRef.current.clear();
			remoteStreamsRef.current.clear();
			peerConnections.forEach(peer => {
				peer.pc.close();
			});
		peerConnections.clear();
		setPeersState(new Map());

		if (localStreamRef.current) {
			localStreamRef.current.getTracks().forEach(track => {
				track.stop();
			});
		}
		localStreamRef.current = null;
		if (localVideo) {
			localVideo.srcObject = null;
		}
	};

	useEffect(() => {
		if (!socket) return;

		const start = async () => {
			try {
				console.log('startRoomSession called');
				const stream = await startRoomSession();

				if (stream) {
					console.log('joinRoom called');
					joinRoom();
				}
			} catch (e) {
				console.log('start room failed', e);
			}
		};
		if (!initializationRef.current) {
			initializationRef.current = true;
			start();
		}

		return () => {
			console.log('cleanup!');
			cleanupRoomResources();
		};
	}, [socket, roomId, nickname]);

	useEffect(() => {
		if (!socket) return;

		const onPeerJoined = (data: { socketId: string; nickname: string }) => {
			const stream = localStreamRef.current;
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
			const stream = localStreamRef.current;
			if (stream) {
				handleExistingParticipants(data, stream);
			}
		};

		const onHandleSdpReceived = (data: {
			fromSocketId: string;
			sdp: RTCSessionDescriptionInit;
		}) => {
			handleSdpReceived(data);
		};

		const onHandleIceReceived = (data: {
			fromSocketId: string;
			candidate: RTCIceCandidateInit;
		}) => {
			handleIceReceived(data);
		};

		const onHandlePeerDisconnect = (socketId: string) => {
			handlePeerDisconnect(socketId);
		};

		socket.on('peer-joined', onPeerJoined);
		socket.on('existing-participants', onExistingParticipants);
		socket.on('sdp-received', onHandleSdpReceived);
		socket.on('ice-received', onHandleIceReceived);
		socket.on('peer-disconnected', onHandlePeerDisconnect);

		return () => {
			socket.off('peer-joined', onPeerJoined);
			socket.off('existing-participants', onExistingParticipants);
			socket.off('sdp-received', onHandleSdpReceived);
			socket.off('ice-received', onHandleIceReceived);
			socket.off('peer-disconnected', onHandlePeerDisconnect);
		};
	}, [socket]);

	// Логи пиров
	useEffect(() => {
		console.log('Peers обновились:', peersState);
	}, [peersState]);

	//
	// Локальные функции
	//

	// Константы
	const MAX_PARTICIPANTS = 4;
	const totalParticipants = peersState.size + 1;
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

		cleanupRoomResources();
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
			localStreamRef.current &&
			localStreamRef.current.getAudioTracks()[0] &&
			localStreamRef.current.getAudioTracks()[0].readyState === 'live'
		) {
			const audio = localStreamRef.current.getAudioTracks()[0];
			audio.enabled = !audio.enabled;
			setIsMicrophone(audio.enabled);
		} else {
			requestAudio();
		}
	};

	// toggle камеры
	const switchCamera = () => {
		if (
			localStreamRef.current &&
			localStreamRef.current.getVideoTracks()[0] &&
			localStreamRef.current.getVideoTracks()[0].readyState === 'live'
		) {
			const video = localStreamRef.current.getVideoTracks()[0];
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
				.then(async videoStream => {
					const newVideo = videoStream.getVideoTracks()[0];
					console.log('video permission granted', {
						trackId: newVideo.id,
					readyState: newVideo.readyState,
				});

				if (localStreamRef.current) {
					const oldVideo = localStreamRef.current.getVideoTracks()[0];
						if (oldVideo) {
							localStreamRef.current.removeTrack(oldVideo);
							oldVideo.stop();
						}
						localStreamRef.current.addTrack(newVideo);
						syncLocalPreview(localStreamRef.current);
					} else {
						const newStream = new MediaStream([newVideo]);
						localStreamRef.current = newStream;
						syncLocalPreview(localStreamRef.current);
					}

					await replaceTrackForPeers('video', newVideo);

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
				.then(async audioStream => {
					const newAudio = audioStream.getAudioTracks()[0];
					console.log('audio permission granted', {
						trackId: newAudio.id,
					readyState: newAudio.readyState,
				});
				if (localStreamRef.current) {
					const oldAudio = localStreamRef.current.getAudioTracks()[0];
						if (oldAudio) {
							localStreamRef.current.removeTrack(oldAudio);
							oldAudio.stop();
						}
						localStreamRef.current.addTrack(newAudio);
						syncLocalPreview(localStreamRef.current);
					} else {
						const newStream = new MediaStream([newAudio]);
						localStreamRef.current = newStream;
						syncLocalPreview(newStream);
					}

					await replaceTrackForPeers('audio', newAudio);

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

					{Array.from(peersState).map(([socketId, peer]) => (
						<RemotePeerCard key={socketId} peer={peer}></RemotePeerCard>
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
