import type { PeerType } from '@/types/PeerType';
import { useEffect, useRef } from 'react';

type Props = {
	peer: PeerType;
};

export default function RemotePeerCard(props: Props) {
	const { stream, nickname } = props.peer;

	const videoRef = useRef<HTMLVideoElement | null>(null);

	const connectStream = (element: HTMLVideoElement, stream: MediaStream) => {
		element.srcObject = stream;
		element
			.play()
			.then(() => {
				console.error('success play video');
			})
			.catch(e => {
				console.error('error play video', e);
			});
	};

	useEffect(() => {
		if (videoRef.current && stream) {
			connectStream(videoRef.current, stream);
		}
	}, [stream]);

	return (
		<div className='relative bg-gray-800 rounded-lg overflow-hidden shadow-lg'>
			<video
				ref={el => {
					if (el) {
						videoRef.current = el;
					}
					if (el && stream) {
						connectStream(el, stream);
					}
				}}
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
