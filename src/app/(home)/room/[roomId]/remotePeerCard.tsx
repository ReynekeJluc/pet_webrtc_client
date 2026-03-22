import type { PeerType } from '@/types/PeerType';
import { useEffect, useRef } from 'react';

type Props = {
	peer: PeerType;
};

export default function RemotePeerCard(props: Props) {
	const { stream, nickname } = props.peer;

	const videoRef = useRef<HTMLVideoElement | null>(null);

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !stream) return;

		if (video.srcObject !== stream) {
			video.srcObject = stream;
		}

		void video.play().catch(e => {
			console.error('error play video', e);
		});
	}, [stream]);

	return (
		<div className='relative bg-gray-800 rounded-lg overflow-hidden shadow-lg'>
			<video
				ref={videoRef}
				className='w-full h-full object-cover'
				playsInline
				autoPlay
			/>
			<div className='absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded-full'>
				<span className='text-white text-sm font-medium'>{nickname}</span>
			</div>
		</div>
	);
}
